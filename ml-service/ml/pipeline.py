"""One sklearn Pipeline per model: feature engineering -> encoding/scaling -> classifier (spec §8–11).

No imputers: missing inputs are rejected at the API rather than silently filled (defect D10).
Everything is fitted on the training split only, inside the Pipeline, so nothing leaks from test data.
"""

from __future__ import annotations

from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

from ml.config import MODEL_CATEGORICAL, MODEL_NUMERIC
from ml.features import build_features


def _feature_names(_transformer, _input_features):
    return MODEL_NUMERIC + MODEL_CATEGORICAL


def make_preprocessor(numeric=MODEL_NUMERIC, categorical=MODEL_CATEGORICAL) -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("num", StandardScaler(), list(numeric)),
            # Why: unknown categories at inference are encoded as all-zeros instead of failing (spec §10).
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), list(categorical)),
        ],
        remainder="drop",
        verbose_feature_names_out=True,
    )


def make_pipeline(estimator, engineer: bool = True, numeric=MODEL_NUMERIC, categorical=MODEL_CATEGORICAL) -> Pipeline:
    steps = []
    if engineer:
        steps.append(("features", FunctionTransformer(build_features, feature_names_out=_feature_names)))
    steps += [("preprocess", make_preprocessor(numeric, categorical)), ("model", estimator)]
    return Pipeline(steps)
