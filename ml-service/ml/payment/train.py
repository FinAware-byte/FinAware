"""Train the missed-payment model and report it honestly.

Run:  python -m ml.payment.train --db ../prisma/prisma/dev.db

Two things this script insists on:

1. **A time-ordered holdout.** The test set is the most recent slice of due dates, so the score
   answers "would this have predicted the future?" and not "can it interpolate?".
2. **Beating the obvious baseline.** A model that cannot outperform "use the user's past miss
   rate" has earned nothing. Both baselines are scored on the same holdout and printed next to
   the models, whichever way the comparison falls.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_predict
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from ml.config import ARTIFACT_DIR, REPORTS_DIR
from ml.payment.dataset import (
    CATEGORICAL_FEATURES,
    FEATURES,
    LABEL,
    NUMERIC_FEATURES,
    build_panel,
    time_split,
)

MODEL_VERSION = "1.0"
PIPELINE_FILE = "payment_pipeline.joblib"
METADATA_FILE = "payment_model_metadata.json"

# Fixed BEFORE looking at any result: rank by average precision, because misses are rare and the
# page ranks who is at risk. Ties inside 0.01 go to the better-calibrated model (lower Brier),
# because the UI shows the probability itself, then to the simpler model.
SELECTION = "average_precision, then Brier score, then simplicity"

MODELS: dict[str, tuple[object, dict]] = {
    "Logistic Regression": (
        LogisticRegression(max_iter=2000, class_weight="balanced"),
        {"model__C": [0.05, 0.25, 1.0, 4.0]},
    ),
    "Random Forest": (
        RandomForestClassifier(random_state=42, class_weight="balanced_subsample"),
        {
            "model__n_estimators": [200, 400],
            "model__max_depth": [3, 5, None],
            "model__min_samples_leaf": [5, 15],
        },
    ),
    "Gradient Boosting": (
        GradientBoostingClassifier(random_state=42),
        {
            "model__n_estimators": [100, 250],
            "model__learning_rate": [0.03, 0.1],
            "model__max_depth": [2, 3],
        },
    ),
}
SIMPLICITY = ["Logistic Regression", "Gradient Boosting", "Random Forest"]


def make_pipeline(estimator) -> Pipeline:
    return Pipeline(
        [
            (
                "prepare",
                ColumnTransformer(
                    [
                        ("numeric", StandardScaler(), NUMERIC_FEATURES),
                        (
                            "categorical",
                            OneHotEncoder(handle_unknown="ignore"),
                            CATEGORICAL_FEATURES,
                        ),
                    ]
                ),
            ),
            ("model", estimator),
        ]
    )


THRESHOLD_GRID = np.round(np.arange(0.05, 0.96, 0.01), 2)


def best_threshold(y_true, proba) -> float:
    """Pick the decision threshold that maximises F1.

    Why not 0.5: only about one payment in eight is missed, so a well-calibrated model almost
    never crosses 0.5 and would flag nobody. The threshold is always chosen on training-set
    out-of-fold predictions and only then applied to the holdout, never tuned on the holdout.
    """
    scored = [
        (
            precision_recall_fscore_support(
                y_true, (proba >= t).astype(int), average="binary", zero_division=0
            )[2],
            t,
        )
        for t in THRESHOLD_GRID
    ]
    return float(max(scored)[1])


def score(y_true, proba, threshold: float = 0.5) -> dict:
    predicted = (proba >= threshold).astype(int)
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, predicted, average="binary", zero_division=0
    )
    return {
        "roc_auc": round(float(roc_auc_score(y_true, proba)), 4),
        "average_precision": round(float(average_precision_score(y_true, proba)), 4),
        "brier": round(float(brier_score_loss(y_true, proba)), 4),
        "threshold": round(float(threshold), 2),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
    }


def baselines(train, test) -> dict[str, dict]:
    """No-ML reference points, scored exactly like the models."""
    y = test[LABEL].to_numpy()
    base_rate = float(train[LABEL].mean())
    heuristic_threshold = best_threshold(
        train[LABEL].to_numpy(), train["prior_miss_rate"].to_numpy()
    )
    return {
        "Baseline: always the base rate": score(y, np.full(len(test), base_rate), base_rate),
        "Baseline: the user's past miss rate": score(
            y, test["prior_miss_rate"].to_numpy(), heuristic_threshold
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="../prisma/prisma/dev.db", help="SQLite database to read")
    parser.add_argument("--holdout", type=float, default=0.3)
    args = parser.parse_args()

    panel = build_panel(args.db)
    train, test = time_split(panel, args.holdout)
    X_train, y_train = train[FEATURES], train[LABEL].to_numpy()
    X_test, y_test = test[FEATURES], test[LABEL].to_numpy()

    print(f"panel {panel.shape[0]} rows | train {len(train)} (miss {y_train.mean():.3f}) "
          f"| test {len(test)} (miss {y_test.mean():.3f})")

    results: dict[str, dict] = dict(baselines(train, test))
    fitted: dict[str, Pipeline] = {}
    chosen_params: dict[str, dict] = {}

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for name, (estimator, grid) in MODELS.items():
        search = GridSearchCV(
            make_pipeline(estimator), grid, scoring="average_precision", cv=cv, n_jobs=-1
        )
        search.fit(X_train, y_train)
        best = search.best_estimator_
        # Threshold from out-of-fold predictions on the training data only.
        oof = cross_val_predict(best, X_train, y_train, cv=cv, method="predict_proba")[:, 1]
        threshold = best_threshold(y_train, oof)
        proba = best.predict_proba(X_test)[:, list(best.classes_).index(1)]
        results[name] = score(y_test, proba, threshold)
        results[name]["cv_average_precision"] = round(float(search.best_score_), 4)
        fitted[name] = best
        chosen_params[name] = search.best_params_
        print(f"  {name:22s} AP={results[name]['average_precision']:.4f} "
              f"AUC={results[name]['roc_auc']:.4f} Brier={results[name]['brier']:.4f}")

    ranked = sorted(
        fitted,
        key=lambda n: (
            -results[n]["average_precision"],
            results[n]["brier"],
            SIMPLICITY.index(n),
        ),
    )
    top = results[ranked[0]]["average_precision"]
    close = [n for n in ranked if top - results[n]["average_precision"] <= 0.01]
    selected = sorted(close, key=lambda n: (results[n]["brier"], SIMPLICITY.index(n)))[0]

    heuristic = results["Baseline: the user's past miss rate"]["average_precision"]
    beats_heuristic = results[selected]["average_precision"] > heuristic

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(fitted[selected], ARTIFACT_DIR / PIPELINE_FILE)

    metadata = {
        "model": selected,
        "model_version": MODEL_VERSION,
        "task": "missed_payment_next",
        "label_source": "Payment_History.missed (recorded outcome, not constructed)",
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "features": FEATURES,
        "selection_rule": SELECTION,
        "hyperparameters": {k: str(v) for k, v in chosen_params[selected].items()},
        "train_rows": int(len(train)),
        "test_rows": int(len(test)),
        "train_miss_rate": round(float(y_train.mean()), 4),
        "test_miss_rate": round(float(y_test.mean()), 4),
        "metrics": results[selected],
        "decision_threshold": results[selected]["threshold"],
        "beats_past_miss_rate_heuristic": bool(beats_heuristic),
        "all_results": results,
    }
    (ARTIFACT_DIR / METADATA_FILE).write_text(json.dumps(metadata, indent=2))

    matrix = confusion_matrix(
        y_test,
        (fitted[selected].predict_proba(X_test)[:, 1] >= results[selected]["threshold"]).astype(int),
    )
    write_report(metadata, results, matrix, chosen_params)
    print(f"\nselected: {selected} | beats past-miss-rate heuristic: {beats_heuristic}")


def write_report(metadata, results, matrix, params) -> None:
    lines = [
        "# Missed-payment model — results",
        "",
        f"Generated {metadata['trained_at']}. Model version {metadata['model_version']}.",
        "",
        "## The task",
        "",
        "Given what is known about a user *before* a payment falls due, estimate the probability",
        "that this payment is missed. The label is `Payment_History.missed`, a recorded outcome.",
        "Nothing computes it from the features, so this model cannot reproduce a rubric the way",
        "the `risk_tier` model does.",
        "",
        f"- Training rows: {metadata['train_rows']} (miss rate {metadata['train_miss_rate']})",
        f"- Holdout rows: {metadata['test_rows']} (miss rate {metadata['test_miss_rate']})",
        "- The holdout is the most recent slice of due dates, never a random sample.",
        "",
        "## Results on the holdout",
        "",
        "| Model | Avg precision | ROC AUC | Brier | Threshold | Precision | Recall | F1 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        marker = " **(selected)**" if name == metadata["model"] else ""
        lines.append(
            f"| {name}{marker} | {r['average_precision']} | {r['roc_auc']} | {r['brier']} "
            f"| {r['threshold']} | {r['precision']} | {r['recall']} | {r['f1']} |"
        )
    verdict = (
        "The selected model beats the past-miss-rate heuristic, so the learning adds something."
        if metadata["beats_past_miss_rate_heuristic"]
        else "**The selected model does not beat the past-miss-rate heuristic.** On this data the "
        "simple rule is as good, which is the honest finding to report rather than hide."
    )
    lines += [
        "",
        f"Selection rule, fixed before training: {metadata['selection_rule']}.",
        "",
        "## Does the model earn its place?",
        "",
        verdict,
        "",
        f"## Confusion matrix at the chosen threshold ({metadata['decision_threshold']})",
        "",
        "| | predicted paid | predicted missed |",
        "|---|---|---|",
        f"| actually paid | {matrix[0][0]} | {matrix[0][1]} |",
        f"| actually missed | {matrix[1][0]} | {matrix[1][1]} |",
        "",
        "## Hyper-parameters chosen",
        "",
    ]
    for name, chosen in params.items():
        lines.append(f"- **{name}**: `{chosen}`")
    lines += [
        "",
        "## Limitations",
        "",
        "1. The payment history is seeded demo data. The seed draws each user's number of missed",
        "   payments from their demo risk band and weights misses towards Garnished debts, so the",
        "   learnable signal is propensity and debt status, not timing.",
        "2. Which payments are missed is uniform in time, so streaks and recency carry little",
        "   information. Do not read the model as having found a temporal pattern.",
        "3. The panel is small and the positive class is rare, so holdout metrics move noticeably",
        "   with the split.",
        "4. Debt balances are a current snapshot, not historised, so balance features are",
        "   approximate at older due dates.",
    ]
    (REPORTS_DIR / "payment_model.md").write_text("\n".join(lines) + "\n")


if __name__ == "__main__":
    main()
