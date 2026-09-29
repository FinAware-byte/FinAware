"""Build the missed-payment panel from FinAware's own Payment_History.

Unlike `risk_tier`, this target is **not constructed**: the label is a recorded outcome
(`Payment_History.missed`), so no feature computes it and the model cannot be accused of
reproducing a rubric.

Every feature at a given due date is derived from payments STRICTLY BEFORE that date, which is
what makes the panel usable for "will the next payment be missed?". The seeded `risk_level` is
deliberately excluded: it is the demo label the rest of the app displays, and using it would let
the model read the answer instead of inferring behaviour.

Training reads the application database directly and offline. The deployed service never does;
it receives already-computed features from the Financial Data Service (spec §36-38).
"""

from __future__ import annotations

import sqlite3
from collections import defaultdict
from pathlib import Path

import pandas as pd

# Payments a user must already have before we will score them. Below this the behavioural
# features are too thin to mean anything.
MIN_PRIOR_PAYMENTS = 3

# Months since the last miss, for a user who has never missed. Chosen well beyond the seeded
# history length so "never missed" sorts apart from "missed long ago".
NEVER_MISSED_MONTHS = 99.0

NUMERIC_FEATURES = [
    "prior_payment_count",
    "prior_miss_rate",
    "recent6_miss_rate",
    "current_miss_streak",
    "months_since_last_miss",
    "active_debt_count",
    "debt_interest_rate_pct",
    "debt_balance_to_income",
    "total_balance_to_income",
]
CATEGORICAL_FEATURES = ["debt_status"]
FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
LABEL = "missed"

MS_PER_MONTH = 1000.0 * 60 * 60 * 24 * 30.44

DISPLAY_NAMES = {
    "prior_payment_count": "Payments on record",
    "prior_miss_rate": "Past missed-payment rate",
    "recent6_miss_rate": "Missed payments in the last 6",
    "current_miss_streak": "Consecutive missed payments",
    "months_since_last_miss": "Months since the last missed payment",
    "active_debt_count": "Number of active debts",
    "debt_interest_rate_pct": "Interest rate on this debt",
    "debt_balance_to_income": "This debt's balance vs monthly income",
    "total_balance_to_income": "Total debt balance vs monthly income",
    "debt_status": "Status of this debt",
}


def _rows(db_path: Path) -> list[sqlite3.Row]:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    try:
        return connection.execute(
            """
            SELECT p.payment_id, p.due_date, p.missed,
                   d.debt_id, d.user_id, d.status AS debt_status,
                   d.interest_rate, d.balance,
                   u.monthly_income
            FROM Payment_History p
            JOIN Debts d ON d.debt_id = p.debt_id
            JOIN Users u ON u.user_id = d.user_id
            ORDER BY d.user_id, p.due_date, p.payment_id
            """
        ).fetchall()
    finally:
        connection.close()


def build_panel(db_path: str | Path) -> pd.DataFrame:
    """One row per scoreable payment, with features known before that payment fell due."""
    rows = _rows(Path(db_path))
    if not rows:
        raise ValueError(f"No payment history found in {db_path}")

    by_user: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in rows:
        by_user[row["user_id"]].append(row)

    # Debt context is a snapshot of the user's current debts; balances are not historised.
    debts_of: dict[int, dict[int, sqlite3.Row]] = defaultdict(dict)
    for row in rows:
        debts_of[row["user_id"]][row["debt_id"]] = row

    records = []
    for user_id, payments in by_user.items():
        debts = debts_of[user_id]
        active_debt_count = sum(1 for d in debts.values() if str(d["debt_status"]).lower() == "active")
        total_balance = sum(float(d["balance"] or 0.0) for d in debts.values())
        income = float(payments[0]["monthly_income"] or 0.0)
        if income <= 0:
            continue  # a ratio against zero income is undefined; the row is dropped, not imputed

        prior_count = prior_misses = streak = 0
        outcomes: list[int] = []
        last_miss_date: float | None = None

        for payment in payments:
            if prior_count >= MIN_PRIOR_PAYMENTS:
                due = float(payment["due_date"])
                months_since = (
                    NEVER_MISSED_MONTHS
                    if last_miss_date is None
                    else round((due - last_miss_date) / MS_PER_MONTH, 2)
                )
                balance = float(payment["balance"] or 0.0)
                records.append(
                    {
                        "user_id": user_id,
                        "debt_id": payment["debt_id"],
                        "due_date": due,
                        "prior_payment_count": prior_count,
                        "prior_miss_rate": round(prior_misses / prior_count, 4),
                        "recent6_miss_rate": round(sum(outcomes[-6:]) / len(outcomes[-6:]), 4),
                        "current_miss_streak": streak,
                        "months_since_last_miss": months_since,
                        "active_debt_count": active_debt_count,
                        "debt_interest_rate_pct": float(payment["interest_rate"] or 0.0),
                        "debt_balance_to_income": round(balance / income, 4),
                        "total_balance_to_income": round(total_balance / income, 4),
                        "debt_status": str(payment["debt_status"]),
                        LABEL: int(payment["missed"]),
                    }
                )

            missed = int(payment["missed"])
            prior_count += 1
            outcomes.append(missed)
            if missed:
                prior_misses += 1
                streak += 1
                last_miss_date = float(payment["due_date"])
            else:
                streak = 0

    panel = pd.DataFrame.from_records(records)
    if panel.empty:
        raise ValueError("Panel is empty: no user had enough payment history to score")
    return panel.sort_values("due_date").reset_index(drop=True)


def time_split(panel: pd.DataFrame, holdout_fraction: float = 0.3) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split on the due date, not at random: the question is about the future, so the test set
    must sit entirely after the training set. A random split would let a user's later payments
    inform their earlier ones."""
    cutoff = panel["due_date"].quantile(1 - holdout_fraction)
    train = panel[panel["due_date"] <= cutoff]
    test = panel[panel["due_date"] > cutoff]
    if train.empty or test.empty:
        raise ValueError("Time split produced an empty side; check the due-date range")
    return train.reset_index(drop=True), test.reset_index(drop=True)
