"""Constructed risk target (risk_target_version 1.0) — PROPOSAL, pending supervisor approval.

The dataset has no genuine Low/Medium/High label. This module builds a documented, deterministic
target from independent financial indicators (spec §18 Option B). See docs/risk_tier_methodology.md.

Why: keeping the rubric as data (RUBRIC) rather than scattered if-statements makes it versionable,
testable and easy to show in the methodology document.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

RISK_TARGET_VERSION = "1.0"
RISK_TARGET_STATUS = "proposed"  # set to "approved" only after written supervisor sign-off
RISK_LABELS = ["Low", "Medium", "High"]

# Each indicator scores 0 (healthy), 1 (watch) or 2 (stressed).
# "higher_is_worse" indicators: value < watch -> 0, watch <= value <= stressed -> 1, value > stressed -> 2.
# "lower_is_worse" indicators: value >= healthy -> 0, stressed <= value < healthy -> 1, value < stressed -> 2.
RUBRIC = [
    {
        "indicator": "repayment_burden",
        "label": "Monthly loan repayment ÷ monthly income (debt_to_income_ratio)",
        "direction": "higher_is_worse",
        "watch": 0.20,
        "stressed": 0.40,
    },
    {
        "indicator": "surplus_share",
        "label": "Monthly surplus after expenses and loan repayment ÷ monthly income",
        "direction": "lower_is_worse",
        "healthy": 0.20,
        "stressed": 0.0,
    },
    {
        "indicator": "expense_ratio",
        "label": "Monthly expenses ÷ monthly income",
        "direction": "higher_is_worse",
        "watch": 0.60,
        "stressed": 0.85,
    },
    {
        "indicator": "credit_score",
        "label": "Credit score (300–850)",
        "direction": "lower_is_worse",
        "healthy": 670,
        "stressed": 580,
    },
    {
        "indicator": "savings_coverage_months",
        "label": "Savings ÷ monthly expenses (months of expenses covered)",
        "direction": "lower_is_worse",
        "healthy": 6,
        "stressed": 3,
    },
]

# Total points 0–10 -> tier. Low 0–2, Medium 3–5, High 6–10.
TIER_CUTS = {"Low": (0, 2), "Medium": (3, 5), "High": (6, 10)}


def indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Raw indicator values from dataset columns. Income is > 0 for every record (validated upstream)."""
    income = df["monthly_income_zar"].astype(float)
    expenses = df["monthly_expenses_zar"].astype(float)
    emi = df["monthly_emi_zar"].astype(float)
    if (income <= 0).any():
        raise ValueError("monthly_income_zar must be > 0 for every record")
    # Why: expenses == 0 would make coverage undefined; treat as fully covered (documented in methodology).
    coverage = np.where(expenses > 0, df["savings_zar"] / expenses.where(expenses > 0, np.nan), np.inf)
    return pd.DataFrame(
        {
            "repayment_burden": emi / income,
            "surplus_share": (income - expenses - emi) / income,
            "expense_ratio": expenses / income,
            "credit_score": df["credit_score"].astype(float),
            "savings_coverage_months": coverage,
        },
        index=df.index,
    )


def _points(values: pd.Series, rule: dict) -> pd.Series:
    if rule["direction"] == "higher_is_worse":
        pts = np.where(values < rule["watch"], 0, np.where(values <= rule["stressed"], 1, 2))
    else:
        pts = np.where(values >= rule["healthy"], 0, np.where(values >= rule["stressed"], 1, 2))
    return pd.Series(pts, index=values.index, dtype=int)


def score(df: pd.DataFrame) -> pd.DataFrame:
    """Per-indicator points, total points and risk_tier for every record."""
    ind = indicators(df)
    pts = pd.DataFrame({f"pts_{r['indicator']}": _points(ind[r["indicator"]], r) for r in RUBRIC})
    pts["risk_points"] = pts.sum(axis=1)
    pts["risk_tier"] = pd.cut(
        pts["risk_points"],
        bins=[-1, TIER_CUTS["Low"][1], TIER_CUTS["Medium"][1], TIER_CUTS["High"][1]],
        labels=RISK_LABELS,
    ).astype(str)
    return pts


def build_target(df: pd.DataFrame) -> pd.Series:
    return score(df)["risk_tier"].rename("risk_tier")


def class_distribution(tier: pd.Series) -> pd.DataFrame:
    counts = tier.value_counts().reindex(RISK_LABELS, fill_value=0)
    return pd.DataFrame({"records": counts, "percentage": (counts / len(tier) * 100).round(2)})


# Rubric inputs — the ablation models (Step 3) are trained WITHOUT these to show how much the
# remaining fields predict on their own (circularity disclosure, spec §20).
RUBRIC_SOURCE_COLUMNS = [
    "monthly_income_zar",
    "monthly_expenses_zar",
    "monthly_emi_zar",
    "credit_score",
    "savings_zar",
    "debt_to_income_ratio",
]
