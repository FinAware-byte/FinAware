"""Serve the missed-payment model.

One payment is scored per active debt, because that is the unit the label was recorded at. The
user-level number is then the chance of missing *at least one* of them, which assumes the debts
fail independently — they plainly do not (a bad month hits every debt at once), so the aggregate
is presented as an estimate and the per-debt numbers stay visible underneath it.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd

from ml.config import ARTIFACT_DIR
from ml.payment.dataset import DISPLAY_NAMES, FEATURES

# Bands for wording only; the probability itself is always shown.
BANDS = ((0.35, "High"), (0.15, "Moderate"))


class PaymentModelUnavailable(RuntimeError):
    pass


def band_for(probability: float, threshold: float) -> str:
    for cut, label in BANDS:
        if probability >= max(cut, threshold):
            return label
    return "Low"


class PaymentPredictor:
    def __init__(self, artifact_dir: Path = ARTIFACT_DIR):
        try:
            self.pipeline = joblib.load(artifact_dir / "payment_pipeline.joblib")
            self.metadata = json.loads((artifact_dir / "payment_model_metadata.json").read_text())
        except FileNotFoundError as exc:
            raise PaymentModelUnavailable(
                f"Missed-payment artefact missing: {Path(exc.filename).name}"
            ) from exc
        self.threshold = float(self.metadata.get("decision_threshold", 0.5))
        self._explainer = None

    def _positive_column(self) -> int:
        return list(self.pipeline.classes_).index(1)

    def _drivers(self, frame: pd.DataFrame, row: int) -> list[dict]:
        """Per-debt SHAP. The binary GradientBoostingClassifier is supported by TreeExplainer
        directly, so this needs none of the per-class reconstruction the risk-tier model does."""
        if self._explainer is None:
            import shap  # imported lazily: only this path needs it

            prepare = self.pipeline.named_steps["prepare"]
            self._explainer = (
                shap.TreeExplainer(self.pipeline.named_steps["model"]),
                prepare,
                list(prepare.get_feature_names_out()),
            )
        explainer, prepare, names = self._explainer
        values = explainer.shap_values(prepare.transform(frame))[row]

        # One-hot columns fold back into the field they came from.
        totals: dict[str, float] = {}
        for name, value in zip(names, values):
            source = name.split("__", 1)[-1]
            if source not in FEATURES:  # e.g. debt_status_Garnished -> debt_status
                source = next((f for f in FEATURES if source.startswith(f)), source)
            totals[source] = totals.get(source, 0.0) + float(value)

        magnitude = sum(abs(v) for v in totals.values()) or 1.0
        ranked = sorted(totals.items(), key=lambda kv: abs(kv[1]), reverse=True)[:4]
        return [
            {
                "feature": feature,
                "label": DISPLAY_NAMES.get(feature, feature),
                "value": _native(frame.iloc[row][feature]),
                "direction": "increases_risk" if contribution > 0 else "reduces_risk",
                "importance": round(abs(contribution) / magnitude, 4),
            }
            for feature, contribution in ranked
        ]

    def predict(self, debts: list[dict]) -> dict:
        if not debts:
            raise ValueError("At least one debt is required")
        frame = pd.DataFrame([{k: d[k] for k in FEATURES} for d in debts])
        proba = self.pipeline.predict_proba(frame)[:, self._positive_column()]

        per_debt = []
        for index, debt in enumerate(debts):
            probability = float(proba[index])
            per_debt.append(
                {
                    "debtId": debt.get("debt_id"),
                    "creditor": debt.get("creditor_name"),
                    "probability": round(probability, 4),
                    "band": band_for(probability, self.threshold),
                    "flagged": bool(probability >= self.threshold),
                    "topDrivers": self._drivers(frame, index),
                }
            )

        none_missed = 1.0
        for row in per_debt:
            none_missed *= 1.0 - row["probability"]
        any_missed = 1.0 - none_missed

        per_debt.sort(key=lambda row: row["probability"], reverse=True)
        return {
            "anyMissedProbability": round(any_missed, 4),
            "band": band_for(any_missed, self.threshold),
            "decisionThreshold": round(self.threshold, 2),
            "debts": per_debt,
            "model": {
                "name": self.metadata["model"],
                "version": self.metadata["model_version"],
                "task": self.metadata["task"],
                "labelSource": self.metadata["label_source"],
            },
            "holdoutMetrics": {
                k: self.metadata["metrics"][k] for k in ("roc_auc", "average_precision", "brier")
            },
        }


def _native(value):
    return value.item() if hasattr(value, "item") else value
