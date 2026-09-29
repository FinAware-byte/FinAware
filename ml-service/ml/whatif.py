"""Answer "what would have to change?" by asking the model, not by guessing.

For each lever the user can realistically move, a grid of candidate values is scored in a single
batch prediction and the smallest change that reaches a better tier is reported. A grid is used
rather than a bisection because a gradient-boosted model is not guaranteed to be monotonic in any
single feature: bisection could sail past a boundary and report a change that does not work.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ml.config import DISPLAY_NAMES, RAW_INPUTS
from ml.proba import ordered_proba
from ml.target import RISK_LABELS

# Better means closer to Low.
TIER_RANK = {label: index for index, label in enumerate(RISK_LABELS)}

GRID_STEPS = 48

# Only fields a person can actually act on. Income is excluded on purpose: "earn R8 000 more" is
# not advice, and the risk-tier model would happily suggest it.
LEVERS: tuple[tuple[str, str], ...] = (
    ("savings_zar", "increase"),
    ("monthly_expenses_zar", "decrease"),
    ("monthly_emi_zar", "decrease"),
)


def _candidates(field: str, direction: str, payload: dict) -> np.ndarray:
    current = float(payload[field])
    if direction == "increase":
        monthly_expenses = float(payload.get("monthly_expenses_zar") or 0.0)
        # A year of expenses, or a tripling, whichever reaches further: enough to cross the
        # savings-coverage bands without proposing absurd numbers.
        ceiling = max(current + 12 * monthly_expenses, current * 3.0, current + 100_000.0)
        return np.linspace(current, ceiling, GRID_STEPS + 1)[1:]
    return np.linspace(current, 0.0, GRID_STEPS + 1)[1:]


def distance_to_better_tier(pipeline, payload: dict) -> dict:
    """Current tier, plus the smallest move on each lever that would improve it."""
    base = pd.DataFrame([{k: payload[k] for k in RAW_INPUTS}])
    base_proba = ordered_proba(pipeline, base)[0]
    current_level = RISK_LABELS[int(np.argmax(base_proba))]
    current_rank = TIER_RANK[current_level]

    result = {
        "currentLevel": current_level,
        "currentProbabilities": {
            label: round(float(p), 6) for label, p in zip(RISK_LABELS, base_proba)
        },
        "targetLevel": None if current_rank == 0 else RISK_LABELS[current_rank - 1],
        "levers": [],
    }
    if current_rank == 0:
        return result  # already the best tier; there is nothing to reach for

    target_rank = current_rank - 1

    for field, direction in LEVERS:
        values = _candidates(field, direction, payload)
        variants = pd.DataFrame([{k: payload[k] for k in RAW_INPUTS} for _ in values])
        variants[field] = values

        proba = ordered_proba(pipeline, variants)
        levels = [RISK_LABELS[int(i)] for i in np.argmax(proba, axis=1)]

        hit = next(
            (i for i, level in enumerate(levels) if TIER_RANK[level] <= target_rank),
            None,
        )
        current_value = float(payload[field])
        lever = {
            "field": field,
            "label": DISPLAY_NAMES.get(field, field),
            "direction": direction,
            "currentValue": round(current_value, 2),
        }
        if hit is None:
            # Honest answer: on this lever alone, within a realistic range, it cannot be done.
            lever.update({"reachable": False})
        else:
            required = float(values[hit])
            lever.update(
                {
                    "reachable": True,
                    "requiredValue": round(required, 2),
                    "change": round(abs(required - current_value), 2),
                    "resultingLevel": levels[hit],
                }
            )
        result["levers"].append(lever)

    # Easiest first, unreachable levers last.
    result["levers"].sort(key=lambda l: (not l.get("reachable", False), l.get("change", float("inf"))))
    return result
