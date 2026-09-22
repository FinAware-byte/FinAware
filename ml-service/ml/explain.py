"""Per-user explanations with SHAP (spec §26–29). Replaces the handoff's perturbation method (defect D5).

Direction is always measured the same way, whatever tier was predicted:
    risk contribution = SHAP(High) − SHAP(Low)
Positive  -> the feature pushes this user's prediction towards High and away from Low ("increases_risk").
Negative  -> towards Low ("decreases_risk").
One-hot columns are summed back to their source field. Importance is each feature's share of the total
absolute contribution for this user (0–1). These are "factors influencing this prediction", not causes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier

from ml.config import DISPLAY_NAMES, MODEL_CATEGORICAL, MODEL_NUMERIC
from ml.features import build_features

SIGNIFICANT = 0.25
MODERATE = 0.10


def influence_band(share: float) -> str:
    if share >= SIGNIFICANT:
        return "Significant"
    if share >= MODERATE:
        return "Moderate"
    return "Minor"


def _gb_class_explainers(model: GradientBoostingClassifier) -> list[shap.TreeExplainer]:
    """SHAP only supports binary GradientBoostingClassifier, so build one exact tree ensemble per class.

    For multi-class GB, raw score of class k = init_k + learning_rate × Σ tree_k(x). Each per-class ensemble is
    passed to TreeExplainer in SHAP's documented dict format; SHAP values are then in raw (log-odds) units.
    """
    init = model._raw_predict_init(np.zeros((1, model.n_features_in_)))[0]
    explainers = []
    for k in range(len(model.classes_)):
        trees = []
        for estimator in model.estimators_[:, k]:
            t = estimator.tree_
            trees.append({
                "children_left": t.children_left,
                "children_right": t.children_right,
                "children_default": t.children_left,
                "features": t.feature,
                "thresholds": t.threshold,
                "values": t.value.reshape(-1, 1) * model.learning_rate,
                "node_sample_weight": t.weighted_n_node_samples,
            })
        explainers.append(shap.TreeExplainer(
            {"trees": trees, "base_offset": float(init[k]), "tree_output": "raw_value", "objective": "squared_error"}))
    return explainers


class Explainer:
    method = "shap_tree"

    def __init__(self, pipeline):
        self.preprocess = pipeline[:-1]
        self.model = pipeline[-1]
        self.columns = list(self.preprocess.get_feature_names_out())
        self.sources = [self._source(c) for c in self.columns]
        classes = list(self.model.classes_)
        self.high, self.low = classes.index("High"), classes.index("Low")
        if isinstance(self.model, RandomForestClassifier):
            self._tree = shap.TreeExplainer(self.model)
            self._gb = None
        elif isinstance(self.model, GradientBoostingClassifier):
            self._tree = None
            self._gb = _gb_class_explainers(self.model)
        else:
            raise TypeError(f"No exact per-user explainer for {type(self.model).__name__}")

    @staticmethod
    def _source(column: str) -> str:
        name = column.split("__", 1)[1]
        if name in MODEL_NUMERIC:
            return name
        for cat in MODEL_CATEGORICAL:
            if name.startswith(cat + "_"):
                return cat
        raise ValueError(f"Unmapped feature column {column}")

    def contributions(self, raw: pd.DataFrame) -> pd.Series:
        """Risk contribution (High − Low) per source feature for a single-row input."""
        Xt = self.preprocess.transform(raw)
        if self._tree is not None:
            sv = np.asarray(self._tree.shap_values(Xt))  # (rows, features, classes)
            per_column = sv[0, :, self.high] - sv[0, :, self.low]
        else:
            per_column = self._gb[self.high].shap_values(Xt)[0] - self._gb[self.low].shap_values(Xt)[0]
        return pd.Series(per_column, index=self.sources).groupby(level=0, sort=False).sum()

    def explain(self, raw: pd.DataFrame, top_k: int = 5) -> list[dict]:
        contrib = self.contributions(raw)
        total = float(contrib.abs().sum()) or 1.0
        values = build_features(raw).iloc[0]
        ranked = contrib.reindex(contrib.abs().sort_values(ascending=False).index)[:top_k]
        drivers = []
        for feature, value in ranked.items():
            share = abs(float(value)) / total
            user_value = values[feature]
            drivers.append({
                "feature": feature,
                "label": DISPLAY_NAMES[feature],
                "importance": round(share, 4),
                "influence": influence_band(share),
                "direction": "increases_risk" if value > 0 else "decreases_risk",
                "value": user_value if isinstance(user_value, str) else round(float(user_value), 4),
            })
        return drivers
