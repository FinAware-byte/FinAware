"""Peer groups: "people in a similar position to you" (KMeans).

Built on the same synthetic dataset as the risk model, with choices that are documented rather
than hidden:

* Records whose loan repayments exceed their whole monthly income are left out. The dataset draws
  its columns independently, so a quarter of its records repay more than they earn — and among
  borrowers the *median* repayment is 1.35x income. Peer figures built on those would tell a user
  that "people like you repay 250% of their income", which no one can.
* Clustering uses position, not just scale: income (log), living costs and repayments as shares of
  income, and credit score. Savings are compared but NOT clustered on: the dataset's median saver
  holds about 100 months of expenses and almost no record holds under three, so real users (who
  mostly hold 0-6 months) sat far from every group and savings alone decided which one they
  landed in — a user spending 38% of income was put in "spending most of what comes in".
* k is chosen by silhouette over 3-6 on a fixed sample. The structure is weak (silhouette ~0.28),
  because the columns are independent; the groups are useful bands, not natural types, and the
  model card says so.

Every group is described by its own medians and quartiles, and by the medians of the members who
manage comfortably (a surplus of at least 10% of income after costs and repayments) — which is
what "people in your position who are doing well" can honestly mean in this data.

Run `python -m ml.segments` to train; artefacts go to artifacts/segments.joblib and
artifacts/segments_metadata.json.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from ml.config import ARTIFACT_DIR, DATA_PATH, RANDOM_STATE

SEGMENTS_VERSION = "1.0"
SEGMENT_FEATURES = ["log_income", "expense_ratio", "repayment_ratio", "credit_score"]
K_RANGE = range(3, 7)
SILHOUETTE_SAMPLE = 8000
SAVINGS_MONTHS_CAP = 600.0
COMFORTABLE_SURPLUS = 0.10
PERCENTILES = list(range(0, 101, 5))

# What is shown to the user, and which way is better. Surplus is what is left after living costs
# and repayments, as a share of income.
METRICS = {
    "income": {"label": "Monthly income", "higher_is_better": True},
    "expense_ratio": {"label": "Living costs, as a share of income", "higher_is_better": False},
    "repayment_ratio": {"label": "Loan repayments, as a share of income", "higher_is_better": False},
    "surplus_ratio": {"label": "Left over each month, as a share of income", "higher_is_better": True},
    "savings_months": {"label": "Months of costs your savings cover", "higher_is_better": True},
    "credit_score": {"label": "Credit score", "higher_is_better": True},
}


def display_metrics(income, expenses, emi, savings, credit_score) -> pd.DataFrame:
    """The figures people understand, from the raw columns (scalars or Series)."""
    income = pd.Series(income, dtype=float)
    expenses = pd.Series(expenses, dtype=float)
    emi = pd.Series(emi, dtype=float)
    savings = pd.Series(savings, dtype=float)
    months = pd.Series(np.where(expenses > 0, savings / expenses.where(expenses > 0, 1), SAVINGS_MONTHS_CAP))
    return pd.DataFrame(
        {
            "income": income,
            "expense_ratio": expenses / income,
            "repayment_ratio": emi / income,
            "surplus_ratio": (income - expenses - emi) / income,
            "savings_months": months.clip(upper=SAVINGS_MONTHS_CAP),
            "credit_score": pd.Series(credit_score, dtype=float),
        }
    )


def segment_features(metrics: pd.DataFrame) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "log_income": np.log(metrics["income"]),
            "expense_ratio": metrics["expense_ratio"],
            # A user can be further out than any peer; cap at 100% so one extreme input cannot
            # dominate the distance, exactly as the training records were limited.
            "repayment_ratio": metrics["repayment_ratio"].clip(upper=1.0),
            "credit_score": metrics["credit_score"],
        }
    )[SEGMENT_FEATURES]


def peer_population(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Records used for peer groups, and how many were left out (repayments above income)."""
    keep = df["monthly_emi_zar"] <= df["monthly_income_zar"]
    return df[keep].reset_index(drop=True), int((~keep).sum())


def _name(profile: dict, overall: dict) -> str:
    """A plain name from how the group's medians differ from everyone's: its two strongest traits,
    in order of what matters most to a budget. Two groups can share a first trait ("low living
    costs") and differ on the second (credit), so one trait alone was not enough to tell them apart."""
    med = {key: profile[key]["median"] for key in METRICS}
    traits = []
    if med["income"] < 0.5 * overall["income"]:
        traits.append("lower income")
    if med["repayment_ratio"] > 0.3:
        traits.append("heavy loan repayments")
    if med["expense_ratio"] >= overall["expense_ratio"] + 0.1:
        traits.append("high living costs")
    elif med["expense_ratio"] <= overall["expense_ratio"] - 0.1:
        traits.append("low living costs")
    if med["credit_score"] >= 680:
        traits.append("strong credit record")
    elif med["credit_score"] <= 470:
        traits.append("weaker credit record")
    if not traits:
        return "Middle of the range"
    name = ", ".join(traits[:2])
    return name[0].upper() + name[1:]


def _describe(values: pd.DataFrame) -> dict:
    return {
        key: {
            "median": float(values[key].median()),
            "p25": float(values[key].quantile(0.25)),
            "p75": float(values[key].quantile(0.75)),
            "grid": [float(v) for v in np.percentile(values[key], PERCENTILES)],
        }
        for key in METRICS
    }


def train(df: pd.DataFrame | None = None) -> tuple[Pipeline, dict]:
    df = pd.read_csv(DATA_PATH) if df is None else df
    population, excluded = peer_population(df)
    metrics = display_metrics(
        population["monthly_income_zar"],
        population["monthly_expenses_zar"],
        population["monthly_emi_zar"],
        population["savings_zar"],
        population["credit_score"],
    )
    X = segment_features(metrics)

    rng = np.random.default_rng(RANDOM_STATE)
    sample = rng.choice(len(X), min(SILHOUETTE_SAMPLE, len(X)), replace=False)
    scaler = StandardScaler().fit(X)
    Z = scaler.transform(X)

    scores = {}
    for k in K_RANGE:
        labels = KMeans(n_clusters=k, n_init=10, random_state=RANDOM_STATE).fit_predict(Z)
        scores[k] = float(silhouette_score(Z[sample], labels[sample]))
    k = max(scores, key=scores.get)

    pipeline = Pipeline(
        [("scale", StandardScaler()), ("kmeans", KMeans(n_clusters=k, n_init=10, random_state=RANDOM_STATE))]
    ).fit(X)
    labels = pipeline.predict(X)

    # How far members sit from their centre, so a user far outside every group can be told so.
    distances = pipeline.transform(X).min(axis=1)

    overall = {key: float(metrics[key].median()) for key in METRICS}
    segments = []
    for cluster in range(k):
        members = metrics[labels == cluster]
        comfortable = members[members["surplus_ratio"] >= COMFORTABLE_SURPLUS]
        profile = _describe(members)
        segments.append(
            {
                "id": cluster,
                "size": int(len(members)),
                "share": round(len(members) / len(metrics), 4),
                "profile": profile,
                "withLoanShare": round(float((members["repayment_ratio"] > 0).mean()), 4),
                "comfortable": {
                    "share": round(len(comfortable) / len(members), 4),
                    "medians": {key: float(comfortable[key].median()) for key in METRICS} if len(comfortable) else None,
                },
                "distanceP95": float(np.percentile(distances[labels == cluster], 95)),
            }
        )
    for segment in segments:
        segment["name"] = _name(segment["profile"], overall)
    # Two groups can earn the same name; number them rather than hide the difference.
    names = [s["name"] for s in segments]
    for segment in segments:
        if names.count(segment["name"]) > 1:
            segment["name"] = f"{segment['name']} ({segment['id'] + 1})"

    metadata = {
        "model": "KMeans",
        "version": SEGMENTS_VERSION,
        "k": k,
        "silhouetteByK": {str(key): round(value, 4) for key, value in scores.items()},
        "silhouette": round(scores[k], 4),
        "features": SEGMENT_FEATURES,
        "recordsUsed": int(len(metrics)),
        "recordsExcluded": excluded,
        "exclusionRule": "monthly loan repayment greater than monthly income",
        "comfortableRule": f"left over at least {int(COMFORTABLE_SURPLUS * 100)}% of income after living costs and repayments",
        "overallMedians": overall,
        "metrics": METRICS,
        "percentiles": PERCENTILES,
        "segments": segments,
        "trainedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "randomState": RANDOM_STATE,
    }
    return pipeline, metadata


class SegmentsUnavailable(RuntimeError):
    pass


class Segmenter:
    def __init__(self, artifact_dir: Path = ARTIFACT_DIR):
        try:
            self.pipeline = joblib.load(artifact_dir / "segments.joblib")
            self.metadata = json.loads((artifact_dir / "segments_metadata.json").read_text())
        except FileNotFoundError as exc:
            raise SegmentsUnavailable("Peer groups not trained — run `python -m ml.segments`") from exc

    def assign(self, payload: dict) -> dict:
        metrics = display_metrics(
            payload["monthly_income_zar"],
            payload["monthly_expenses_zar"],
            payload["monthly_emi_zar"],
            payload["savings_zar"],
            payload["credit_score"],
        )
        X = segment_features(metrics)
        cluster = int(self.pipeline.predict(X)[0])
        distance = float(self.pipeline.transform(X).min(axis=1)[0])
        segment = self.metadata["segments"][cluster]
        you = metrics.iloc[0]

        rows = []
        for key, info in self.metadata["metrics"].items():
            profile = segment["profile"][key]
            grid = profile["grid"]
            value = float(you[key])
            comfortable = segment["comfortable"]["medians"]
            rows.append(
                {
                    "key": key,
                    "label": info["label"],
                    "higherIsBetter": info["higher_is_better"],
                    "you": value,
                    "groupMedian": profile["median"],
                    "groupP25": profile["p25"],
                    "groupP75": profile["p75"],
                    # Share of the group below this user, read off the stored percentile grid.
                    "percentile": float(np.interp(value, grid, self.metadata["percentiles"])),
                    "outsideGroup": bool(value < grid[0] or value > grid[-1]),
                    "comfortableMedian": comfortable[key] if comfortable else None,
                }
            )

        return {
            "segment": {
                "id": cluster,
                "name": segment["name"],
                "size": segment["size"],
                "share": segment["share"],
                "withLoanShare": segment["withLoanShare"],
                "comfortableShare": segment["comfortable"]["share"],
            },
            # Further from the centre than 95% of the group's own members: the comparison is rough.
            "typical": distance <= segment["distanceP95"],
            "metrics": rows,
            "model": {
                "name": self.metadata["model"],
                "version": self.metadata["version"],
                "k": self.metadata["k"],
                "silhouette": self.metadata["silhouette"],
                "recordsUsed": self.metadata["recordsUsed"],
                "recordsExcluded": self.metadata["recordsExcluded"],
                "comfortableRule": self.metadata["comfortableRule"],
            },
        }


def main() -> None:
    started = time.time()
    pipeline, metadata = train()
    ARTIFACT_DIR.mkdir(exist_ok=True)
    joblib.dump(pipeline, ARTIFACT_DIR / "segments.joblib", compress=3)
    (ARTIFACT_DIR / "segments_metadata.json").write_text(json.dumps(metadata, indent=2))
    print(
        f"k={metadata['k']} silhouette={metadata['silhouette']} "
        f"({metadata['recordsUsed']} records, {metadata['recordsExcluded']} left out) in {time.time() - started:.0f}s"
    )
    for segment in metadata["segments"]:
        print(f"  {segment['id']}: {segment['name']} — {segment['size']} ({segment['share']:.1%})")


if __name__ == "__main__":
    main()
