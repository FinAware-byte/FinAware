"""Train, evaluate and select the FinAware risk model (spec §21–25, §40).

Run:  python -m ml.train                 (refuses to run until the target is approved)
      python -m ml.train --allow-proposed-target   (provisional run; artefacts are labelled as such)
"""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.inspection import permutation_importance
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC

from ml import target as T
from ml.config import (
    ARTIFACT_DIR,
    CATEGORY_VALUES,
    CV_FOLDS,
    DATA_PATH,
    DATASET_RATIOS,
    DISPLAY_NAMES,
    ENGINEERED,
    EXCLUDED_FROM_FEATURES,
    MODEL_CATEGORICAL,
    MODEL_DISPLAY_NAMES,
    MODEL_NUMERIC,
    MODEL_VERSION,
    RANDOM_STATE,
    RAW_CATEGORICAL_INPUTS,
    RAW_INPUTS,
    RAW_NUMERIC_INPUTS,
    REPORTS_DIR,
    TEST_SIZE,
)
from ml.data_audit import audit, sha256
from ml.evaluate import evaluate, save_confusion_matrix, write_report
from ml.pipeline import make_pipeline

TREE_MODELS = {"random_forest", "gradient_boosting"}
SELECTION_TOLERANCE = 0.01

# Validation limits accepted by the API (wider than the training data where FinAware users differ).
INPUT_LIMITS = {
    "age": (16, 100),
    "monthly_income_zar": (0.01, None),
    "monthly_expenses_zar": (0, None),
    "savings_zar": (0, None),
    "credit_score": (300, 850),
    "loan_amount_zar": (0, None),
    "monthly_emi_zar": (0, None),
    "loan_interest_rate_pct": (0, 100),
}
ABLATION_NUMERIC = ["age", "loan_amount_zar", "loan_interest_rate_pct"]
ABLATION_CATEGORICAL = ["employment_status", "has_loan"]


def candidates():
    """(estimator, grid) per model. Grids are deliberately small; see the report."""
    cv_inner = 3
    return {
        "random_forest": (
            RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=1),
            {"model__max_depth": [None, 16], "model__min_samples_leaf": [1, 3]},
        ),
        "gradient_boosting": (
            GradientBoostingClassifier(max_depth=3, random_state=RANDOM_STATE),
            {"model__n_estimators": [150, 300], "model__learning_rate": [0.05, 0.1]},
        ),
        "knn": (
            KNeighborsClassifier(),
            {"model__n_neighbors": [5, 15, 31], "model__weights": ["uniform", "distance"]},
        ),
        "svm": (
            CalibratedClassifierCV(SVC(kernel="rbf", gamma="scale", class_weight="balanced", random_state=RANDOM_STATE),
                                   method="sigmoid", cv=cv_inner),
            {"model__estimator__C": [1.0, 5.0]},
        ),
    }


def ablation_estimators(best_params: dict):
    """Same model families with the main run's selected hyper-parameters, on the reduced inputs."""
    def params(key):
        return {k.replace("model__", "", 1): v for k, v in best_params[key].items()}

    rf = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=RANDOM_STATE, n_jobs=-1)
    gb = GradientBoostingClassifier(max_depth=3, random_state=RANDOM_STATE)
    knn = KNeighborsClassifier()
    svm = CalibratedClassifierCV(SVC(kernel="rbf", gamma="scale", class_weight="balanced", random_state=RANDOM_STATE),
                                 method="sigmoid", cv=3)
    rf.set_params(**params("random_forest"))
    gb.set_params(**params("gradient_boosting"))
    knn.set_params(**params("knn"))
    svm.set_params(**params("svm"))
    return {"random_forest": rf, "gradient_boosting": gb, "knn": knn, "svm": svm}


def select_model(results: dict) -> dict:
    f1 = {k: r["test"]["f1_macro"] for k, r in results.items()}
    best = max(f1, key=f1.get)
    close = [k for k in results if f1[best] - f1[k] <= SELECTION_TOLERANCE]
    pool = [k for k in close if k in TREE_MODELS] or close
    chosen = max(pool, key=lambda k: (results[k]["test"]["per_class"]["High"]["recall"], -results[k]["test"]["log_loss"]))
    N = MODEL_DISPLAY_NAMES
    m = results[chosen]["test"]
    reasons = [
        f"Highest test macro F1: {N[best]} ({f1[best]:.3f}). Within {SELECTION_TOLERANCE}: {', '.join(N[k] for k in close)}.",
        f"{N[chosen]}: macro F1 {m['f1_macro']:.3f}, weighted F1 {m['f1_weighted']:.3f}, High-risk recall "
        f"{m['per_class']['High']['recall']:.3f}, log loss {m['log_loss']:.3f}, {m['latency_ms_single_row']:.1f} ms per prediction.",
    ]
    if chosen in TREE_MODELS:
        reasons.append("Tree-based, so each user's prediction can be explained exactly with SHAP TreeExplainer.")
    for k in results:
        if k not in close:
            reasons.append(f"{N[k]} not selected: macro F1 {f1[k]:.3f} is more than {SELECTION_TOLERANCE} below the best.")
        elif k != chosen:
            why = "no exact per-user explanation method" if k not in TREE_MODELS else "lower High-risk recall / worse log loss"
            reasons.append(f"{N[k]} not selected: {why}.")
    return {"selected": chosen, "tolerance": SELECTION_TOLERANCE, "reasons": reasons}


def feature_schema(df: pd.DataFrame) -> dict:
    fields = {}
    for col in RAW_NUMERIC_INPUTS:
        lo, hi = INPUT_LIMITS[col]
        fields[col] = {"type": "number", "required": True, "min": lo, "max": hi, "display_name": DISPLAY_NAMES[col],
                       "training_min": float(df[col].min()), "training_max": float(df[col].max())}
    for col in RAW_CATEGORICAL_INPUTS:
        fields[col] = {"type": "category", "required": True, "allowed": CATEGORY_VALUES[col], "display_name": DISPLAY_NAMES[col]}
    return {
        "inputs": fields,
        "computed_server_side": {
            "debt_to_income_ratio": "monthly_emi_zar ÷ monthly_income_zar, 2 dp",
            "savings_to_income_ratio": "savings_zar ÷ (monthly_income_zar × 12), clipped 0.1–10, 2 dp",
            "disposable_income_zar": "monthly_income_zar − monthly_expenses_zar",
            "expense_to_income_ratio": "monthly_expenses_zar ÷ monthly_income_zar",
            "monthly_surplus_after_emi_zar": "monthly_income_zar − monthly_expenses_zar − monthly_emi_zar",
            "savings_coverage_months": "savings_zar ÷ monthly_expenses_zar, capped at 600; expenses = 0 → 600",
            "loan_to_income_ratio": "loan_amount_zar ÷ (monthly_income_zar × 12)",
        },
        "model_features": MODEL_NUMERIC + MODEL_CATEGORICAL,
        "excluded": EXCLUDED_FROM_FEATURES,
        "rules": ["has_loan = 'No' requires loan_amount_zar = 0 and monthly_emi_zar = 0"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-proposed-target", action="store_true",
                    help="Train on a target that is not yet supervisor-approved (artefacts labelled provisional).")
    ap.add_argument("--skip-ablation", action="store_true")
    args = ap.parse_args()

    if T.RISK_TARGET_STATUS != "approved" and not args.allow_proposed_target:
        raise SystemExit(
            f"risk_target_version {T.RISK_TARGET_VERSION} is '{T.RISK_TARGET_STATUS}', not 'approved'. "
            "Get supervisor sign-off (docs/risk_tier_methodology.md) or pass --allow-proposed-target for a provisional run."
        )

    started = time.time()
    ARTIFACT_DIR.mkdir(exist_ok=True)
    REPORTS_DIR.mkdir(exist_ok=True)

    df = audit()
    y = T.build_target(df)
    class_dist = T.class_distribution(y)
    print(class_dist.to_string())

    X = df[RAW_INPUTS]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y)
    cv = StratifiedKFold(CV_FOLDS, shuffle=True, random_state=RANDOM_STATE)

    results, fitted = {}, {}
    for key, (estimator, grid) in candidates().items():
        t0 = time.time()
        search = GridSearchCV(make_pipeline(estimator), grid, scoring="f1_macro", cv=cv, n_jobs=-1, refit=True)
        search.fit(X_train, y_train)
        best_i = search.best_index_
        fitted[key] = search.best_estimator_
        results[key] = {
            "grid": grid,
            "best_params": search.best_params_,
            "cv_f1_macro_mean": float(search.cv_results_["mean_test_score"][best_i]),
            "cv_f1_macro_std": float(search.cv_results_["std_test_score"][best_i]),
            "test": evaluate(search.best_estimator_, X_test, y_test),
            "fit_seconds": round(time.time() - t0, 1),
        }
        save_confusion_matrix(results[key]["test"]["confusion_matrix"], MODEL_DISPLAY_NAMES[key], REPORTS_DIR / f"confusion_{key}.png")
        print(f"{key:18s} macroF1={results[key]['test']['f1_macro']:.4f} acc={results[key]['test']['accuracy']:.4f} "
              f"({results[key]['fit_seconds']}s) {search.best_params_}")

    # Permutation importance on raw inputs for every model (model-agnostic, spec §27).
    sample, _, y_sample, _ = train_test_split(X_test, y_test, train_size=2000, random_state=RANDOM_STATE, stratify=y_test)
    importance = {"n_rows": len(sample), "n_repeats": 5, "by_model": {}}
    for key, model in fitted.items():
        pi = permutation_importance(model, sample, y_sample, scoring="f1_macro", n_repeats=5, random_state=RANDOM_STATE, n_jobs=-1)
        importance["by_model"][key] = {c: {"mean": float(pi.importances_mean[i]), "std": float(pi.importances_std[i])}
                                       for i, c in enumerate(RAW_INPUTS)}
    print("permutation importance done")

    ablation = {"inputs": ABLATION_NUMERIC + ABLATION_CATEGORICAL, "results": {}}
    if not args.skip_ablation:
        for key, est in ablation_estimators({k: r["best_params"] for k, r in results.items()}).items():
            pipe = make_pipeline(est, engineer=False, numeric=ABLATION_NUMERIC, categorical=ABLATION_CATEGORICAL)
            pipe.fit(X_train, y_train)
            ablation["results"][key] = evaluate(pipe, X_test, y_test)
            print(f"ablation {key:18s} macroF1={ablation['results'][key]['f1_macro']:.4f}")

    selection = select_model(results)
    chosen = selection["selected"]
    model = fitted[chosen]

    meta = {
        "model": MODEL_DISPLAY_NAMES[chosen],
        "model_key": chosen,
        "model_version": MODEL_VERSION,
        "version": MODEL_VERSION,
        "target": "risk_tier",
        "target_version": T.RISK_TARGET_VERSION,
        "target_status": T.RISK_TARGET_STATUS,
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
        "cv_folds": CV_FOLDS,
        "class_order": T.RISK_LABELS,
        "raw_inputs": RAW_INPUTS,
        "model_features": MODEL_NUMERIC + MODEL_CATEGORICAL,
        "dataset_ratios": DATASET_RATIOS,
        "engineered_features": ENGINEERED,
        "best_params": results[chosen]["best_params"],
        "metrics": {k: v for k, v in results[chosen]["test"].items()},
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "data_file": DATA_PATH.name,
        "data_sha256": sha256(DATA_PATH),
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": platform.python_version(),
        "sklearn": sklearn.__version__,
        "risk_score_formula": "100 × (0.5 × P(Medium) + 1.0 × P(High))",
    }

    joblib.dump(model, ARTIFACT_DIR / "pipeline.joblib", compress=3)
    (ARTIFACT_DIR / "model_metadata.json").write_text(json.dumps(meta, indent=2, default=float))
    (ARTIFACT_DIR / "feature_schema.json").write_text(json.dumps(feature_schema(df), indent=2))
    (REPORTS_DIR / "metrics.json").write_text(json.dumps(
        {"results": results, "ablation": ablation, "importance": importance, "selection": selection,
         "class_distribution": class_dist.reset_index().to_dict("records")}, indent=2, default=float))
    write_report(REPORTS_DIR / "model_comparison.md", results=results, ablation=ablation, importance=importance,
                 selection=selection, meta=meta, class_dist=class_dist)
    print(f"Selected {chosen}; artefacts in {ARTIFACT_DIR}; {time.time() - started:.0f}s total")


if __name__ == "__main__":
    np.random.seed(RANDOM_STATE)
    main()
