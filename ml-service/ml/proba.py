"""Probability helpers shared by training and inference.

Why: kept out of ml/evaluate.py so the runtime image never imports matplotlib (evaluate.py is only used
when training/reporting, and matplotlib is a dev-only dependency).
"""

from __future__ import annotations

import numpy as np

from ml.target import RISK_LABELS


def ordered_proba(model, X) -> np.ndarray:
    """predict_proba columns re-ordered to Low, Medium, High by class NAME, never by position (spec §25)."""
    proba = model.predict_proba(X)
    index = {label: i for i, label in enumerate(model.classes_)}
    return proba[:, [index[label] for label in RISK_LABELS]]
