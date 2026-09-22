"""Feature engineering shared by training and inference (spec §13–14).

Fixes handoff defects D2 (DTI definition), D3 (savings ratio overwritten) and D7 (duplicate features).
The same function runs inside the saved sklearn Pipeline, so training and inference cannot drift apart.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ml.config import (
    ENGINEERED,
    MODEL_CATEGORICAL,
    MODEL_NUMERIC,
    RAW_INPUTS,
    SAVINGS_COVERAGE_CAP_MONTHS,
)


def dataset_ratios(df: pd.DataFrame) -> pd.DataFrame:
    """Recompute the dataset's own ratio fields from raw values, exactly as the dataset defines them.

    debt_to_income_ratio    = monthly EMI ÷ monthly income, 2 dp
    savings_to_income_ratio = savings ÷ ANNUAL income, clipped to 0.1–10, 2 dp
    Verified against every dataset record (max difference 0.01 from ZAR rounding; 0 from USD).
    """
    income = df["monthly_income_zar"].astype(float)
    return pd.DataFrame(
        {
            "debt_to_income_ratio": (df["monthly_emi_zar"] / income).round(2),
            "savings_to_income_ratio": (df["savings_zar"] / (income * 12)).clip(0.1, 10).round(2),
        },
        index=df.index,
    )


def engineered(df: pd.DataFrame) -> pd.DataFrame:
    income = df["monthly_income_zar"].astype(float)
    expenses = df["monthly_expenses_zar"].astype(float)
    emi = df["monthly_emi_zar"].astype(float)
    savings = df["savings_zar"].astype(float)

    # Why: expenses == 0 makes coverage undefined — use a documented cap, never Infinity or 0.
    coverage = pd.Series(SAVINGS_COVERAGE_CAP_MONTHS, index=df.index, dtype=float)
    has_expenses = expenses > 0
    coverage[has_expenses] = (savings[has_expenses] / expenses[has_expenses]).clip(upper=SAVINGS_COVERAGE_CAP_MONTHS)

    return pd.DataFrame(
        {
            "disposable_income_zar": income - expenses,
            "expense_to_income_ratio": expenses / income,
            "monthly_surplus_after_emi_zar": income - expenses - emi,
            "savings_coverage_months": coverage,
            "loan_to_income_ratio": df["loan_amount_zar"].astype(float) / (income * 12),
        },
        index=df.index,
    )[ENGINEERED]


def build_features(raw: pd.DataFrame) -> pd.DataFrame:
    """Raw model inputs -> full model feature frame (numeric + categorical, fixed column order).

    Income must be > 0 (enforced by API validation and asserted by the data audit).
    """
    missing = [c for c in RAW_INPUTS if c not in raw.columns]
    if missing:
        raise ValueError(f"Missing required inputs: {missing}")
    if (raw["monthly_income_zar"].astype(float) <= 0).any():
        raise ValueError("monthly_income_zar must be > 0")

    x = pd.concat([raw[RAW_INPUTS].reset_index(drop=True), dataset_ratios(raw).reset_index(drop=True),
                   engineered(raw).reset_index(drop=True)], axis=1)
    x.index = raw.index
    numeric = x[MODEL_NUMERIC].astype(float)
    if not np.isfinite(numeric.to_numpy()).all():
        raise ValueError("Non-finite value produced during feature engineering")
    return pd.concat([numeric, x[MODEL_CATEGORICAL].astype(str)], axis=1)
