"""Data-quality audit (spec §5). Replaces the handoff's silent clean() (defect D8).

Nothing is altered: every check is reported, and any failure stops training.
Run:  python -m ml.data_audit   -> reports/data_audit.md
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np
import pandas as pd

from ml.config import (
    CATEGORY_VALUES,
    DATA_PATH,
    EXPECTED_COLUMNS,
    REPORTS_DIR,
    USD_TO_ZAR,
    ZAR_USD_PAIRS,
)
from ml.features import dataset_ratios, engineered

EXPECTED_ROWS = 32_424


@dataclass
class Check:
    name: str
    passed: bool
    detail: str


def sha256(path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_dataset(path=DATA_PATH) -> pd.DataFrame:
    return pd.read_csv(path)


def run_checks(df: pd.DataFrame) -> list[Check]:
    checks: list[Check] = []
    add = lambda name, ok, detail: checks.append(Check(name, bool(ok), detail))  # noqa: E731

    add("Row count", len(df) == EXPECTED_ROWS, f"{len(df):,} rows (expected {EXPECTED_ROWS:,})")
    add("Columns match data dictionary", list(df.columns) == EXPECTED_COLUMNS, f"{df.shape[1]} columns")
    add("No missing values", df.isna().sum().sum() == 0, f"{int(df.isna().sum().sum())} missing cells")
    add("No duplicate rows", not df.duplicated().any(), f"{int(df.duplicated().sum())} duplicate rows")
    add("user_id unique", df["user_id"].is_unique, f"{df['user_id'].nunique():,} unique ids")

    numeric = [c for c in EXPECTED_COLUMNS if c not in CATEGORY_VALUES and c not in ("user_id", "record_date")]
    non_numeric = [c for c in numeric if not pd.api.types.is_numeric_dtype(df[c])]
    add("Numeric columns have numeric types", not non_numeric, f"non-numeric: {non_numeric or 'none'}")

    negatives = {c: int((df[c] < 0).sum()) for c in numeric if (df[c] < 0).any()}
    add("No negative numeric values", not negatives, f"negatives: {negatives or 'none'}")

    for col, allowed in CATEGORY_VALUES.items():
        found = sorted(df[col].unique())
        add(f"Categories of {col}", set(found) <= set(allowed), ", ".join(found))

    ranges = {"age": (18, 100), "credit_score": (300, 850), "loan_interest_rate_pct": (0, 100),
              "loan_term_months": (0, 480), "savings_to_income_ratio": (0.1, 10)}
    for col, (lo, hi) in ranges.items():
        ok = df[col].between(lo, hi).all()
        add(f"Range of {col}", ok, f"min {df[col].min()}, max {df[col].max()} (allowed {lo}–{hi})")

    add("Income > 0 (ratio denominators)", (df["monthly_income_zar"] > 0).all(),
        f"min R{df['monthly_income_zar'].min():,.2f}")
    add("Expenses > 0 (coverage denominator)", (df["monthly_expenses_zar"] > 0).all(),
        f"min R{df['monthly_expenses_zar'].min():,.2f}")

    dates = pd.to_datetime(df["record_date"], errors="coerce")
    add("record_date parses", dates.notna().all(), f"{dates.min().date()} to {dates.max().date()}")

    for zar, usd in ZAR_USD_PAIRS.items():
        diff = (df[zar] - (df[usd] * USD_TO_ZAR).round(2)).abs().max()
        add(f"{zar} = {usd} × {USD_TO_ZAR}", diff <= 0.011, f"max difference {diff:.4f}")

    no_loan = df["has_loan"] == "No"
    loan_fields = ["loan_amount_zar", "loan_term_months", "monthly_emi_zar", "loan_interest_rate_pct"]
    add("has_loan = No ⇒ loan_type 'No Loan' and loan fields 0",
        (df.loc[no_loan, "loan_type"] == "No Loan").all() and (df.loc[no_loan, loan_fields] == 0).all().all(),
        f"{int(no_loan.sum()):,} records without a loan")
    add("has_loan = Yes ⇒ loan amount > 0 and a loan type",
        (df.loc[~no_loan, "loan_amount_zar"] > 0).all() and (df.loc[~no_loan, "loan_type"] != "No Loan").all(),
        f"{int((~no_loan).sum()):,} records with a loan")

    ratios = dataset_ratios(df)
    dti_diff = (ratios["debt_to_income_ratio"] - df["debt_to_income_ratio"]).abs().max()
    add("debt_to_income_ratio = EMI ÷ monthly income", dti_diff <= 0.011, f"max difference {dti_diff:.4f}")
    sav_diff = (ratios["savings_to_income_ratio"] - df["savings_to_income_ratio"]).abs().max()
    add("savings_to_income_ratio = savings ÷ annual income, clipped 0.1–10", sav_diff <= 0.011,
        f"max difference {sav_diff:.4f}")

    eng = engineered(df)
    add("Engineered features are finite", np.isfinite(eng.to_numpy()).all(), ", ".join(eng.columns))
    return checks


def observations(df: pd.DataFrame) -> list[str]:
    """Facts that are not failures but must be known when interpreting results."""
    loan = df["has_loan"] == "Yes"
    surplus = df["monthly_income_zar"] - df["monthly_expenses_zar"] - df["monthly_emi_zar"]
    coverage = df["savings_zar"] / df["monthly_expenses_zar"]
    corr = df.select_dtypes("number").corr()["credit_score"].drop("credit_score").abs().max()
    med_income = df.groupby("employment_status")["monthly_income_zar"].median().round(0).to_dict()
    return [
        f"{(df['monthly_expenses_zar'] > df['monthly_income_zar']).sum()} records have expenses above income.",
        f"{(surplus < 0).mean():.1%} of all records ({(surplus[loan] < 0).mean():.1%} of borrowers) have a negative surplus after loan repayment.",
        f"{(df.loc[loan, 'monthly_emi_zar'] > df.loc[loan, 'monthly_income_zar']).mean():.1%} of borrowers have a monthly repayment above their monthly income.",
        f"Median savings cover {coverage.median():.0f} months of expenses (max {coverage.max():.0f}); the {600}-month cap never applies to the dataset.",
        f"Largest absolute correlation between credit_score and any other numeric field: {corr:.3f}.",
        f"Median monthly income by employment status (ZAR): {med_income} — employment status does not drive income.",
        "Columns appear to have been generated independently at random; demographic fields carry no real signal.",
    ]


def write_report(df: pd.DataFrame, checks: list[Check], path=REPORTS_DIR / "data_audit.md") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    passed = sum(c.passed for c in checks)
    lines = [
        "# Data audit — personal_finance_zar.csv",
        "",
        "Generated by `python -m ml.data_audit`. **No record was altered, removed or imputed.**",
        "",
        f"- File: `{DATA_PATH.name}` · SHA-256 `{sha256(DATA_PATH)}`",
        f"- Shape: {df.shape[0]:,} rows × {df.shape[1]} columns",
        f"- Checks passed: **{passed} / {len(checks)}**",
        "",
        "| # | Check | Result | Detail |",
        "|---|---|---|---|",
    ]
    lines += [f"| {i} | {c.name} | {'PASS' if c.passed else '**FAIL**'} | {c.detail} |" for i, c in enumerate(checks, 1)]
    lines += ["", "## Observations", ""] + [f"- {o}" for o in observations(df)]
    lines += [
        "",
        "## Transformations applied for modelling",
        "",
        "| Transformation | Records affected | Reason |",
        "|---|---|---|",
        "| None to the source data | 0 | Dataset used as supplied (spec §5, §12 — large values retained) |",
        "| debt_to_income_ratio and savings_to_income_ratio recomputed from ZAR raw values with the dataset's own definitions | all (max change 0.01, rounding) | Identical calculation at training and inference time |",
        "| Engineered features added (disposable income, expense ratio, surplus after EMI, savings coverage, loan-to-income) | all | Spec §13 |",
        "| Savings coverage capped at 600 months; expenses = 0 → 600 | 0 | Division-by-zero strategy (spec §14) |",
        "",
    ]
    path.write_text("\n".join(lines), encoding="utf-8")


def audit(df: pd.DataFrame | None = None, write: bool = True) -> pd.DataFrame:
    df = load_dataset() if df is None else df
    checks = run_checks(df)
    if write:
        write_report(df, checks)
    failed = [c for c in checks if not c.passed]
    if failed:
        raise ValueError("Data audit failed: " + "; ".join(f"{c.name} ({c.detail})" for c in failed))
    return df


if __name__ == "__main__":
    data = audit()
    print(f"Data audit passed: {len(data):,} rows -> {REPORTS_DIR / 'data_audit.md'}")
