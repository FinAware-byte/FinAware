"""Central configuration for the FinAware ML service (fixes handoff defects D1, D7 and the region alias)."""

from __future__ import annotations

from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "personal_finance_zar.csv"
ARTIFACT_DIR = BASE_DIR / "artifacts"
REPORTS_DIR = BASE_DIR / "reports"

MODEL_VERSION = "1.0"
RANDOM_STATE = 42
TEST_SIZE = 0.2
CV_FOLDS = 5
USD_TO_ZAR = 16.27

# The 24 columns documented in data_dictionary.xlsx, in file order.
EXPECTED_COLUMNS = [
    "user_id", "age", "gender", "education_level", "employment_status", "job_title",
    "monthly_income_usd", "monthly_expenses_usd", "savings_usd", "has_loan", "loan_type",
    "loan_amount_usd", "loan_term_months", "monthly_emi_usd", "loan_interest_rate_pct",
    "debt_to_income_ratio", "credit_score", "savings_to_income_ratio", "record_date",
    "monthly_income_zar", "monthly_expenses_zar", "savings_zar", "loan_amount_zar", "monthly_emi_zar",
]

CATEGORY_VALUES = {
    "gender": ["Female", "Male", "Other"],
    "education_level": ["Bachelor", "High School", "Master", "Other", "PhD"],
    "employment_status": ["Employed", "Self-employed", "Student", "Unemployed"],
    "job_title": ["Accountant", "Doctor", "Driver", "Engineer", "Manager", "Salesperson", "Student", "Teacher", "Unemployed"],
    "has_loan": ["No", "Yes"],
    "loan_type": ["Business", "Car", "Education", "Home", "No Loan"],
}

ZAR_USD_PAIRS = {
    "monthly_income_zar": "monthly_income_usd",
    "monthly_expenses_zar": "monthly_expenses_usd",
    "savings_zar": "savings_usd",
    "loan_amount_zar": "loan_amount_usd",
    "monthly_emi_zar": "monthly_emi_usd",
}

# ---- Model inputs (Decision D-2: only data FinAware holds in FinancialProfile, Debt and Users) ----
# D1 fix: the interest rate column is loan_interest_rate_pct (the handoff used "interest_rate").
RAW_NUMERIC_INPUTS = [
    "age",
    "monthly_income_zar",
    "monthly_expenses_zar",
    "savings_zar",
    "credit_score",
    "loan_amount_zar",
    "monthly_emi_zar",
    "loan_interest_rate_pct",
]
RAW_CATEGORICAL_INPUTS = ["employment_status", "has_loan"]
RAW_INPUTS = RAW_NUMERIC_INPUTS + RAW_CATEGORICAL_INPUTS

# Dataset fields recomputed server-side from raw inputs with the dataset's own definitions (D2/D3 fix).
DATASET_RATIOS = ["debt_to_income_ratio", "savings_to_income_ratio"]

# D7 fix: no debt_zar, loan_burden_zar or emi_to_income_ratio (duplicates of existing fields).
ENGINEERED = [
    "disposable_income_zar",
    "expense_to_income_ratio",
    "monthly_surplus_after_emi_zar",
    "savings_coverage_months",
    "loan_to_income_ratio",
]

MODEL_NUMERIC = RAW_NUMERIC_INPUTS + DATASET_RATIOS + ENGINEERED
MODEL_CATEGORICAL = RAW_CATEGORICAL_INPUTS

EXCLUDED_FROM_FEATURES = {
    "user_id": "Identifier (spec §6)",
    "record_date": "Date only; no temporal modelling (spec §16)",
    "monthly_income_usd": "Duplicates the ZAR column (spec §16)",
    "monthly_expenses_usd": "Duplicates the ZAR column (spec §16)",
    "savings_usd": "Duplicates the ZAR column (spec §16)",
    "loan_amount_usd": "Duplicates the ZAR column (spec §16)",
    "monthly_emi_usd": "Duplicates the ZAR column (spec §16)",
    "gender": "Decision D-2: not in the UML data model; no signal; appropriateness flagged by the dictionary",
    "education_level": "Decision D-2: not in the UML data model; no signal",
    "job_title": "Decision D-2: not in the UML data model; independent of employment status",
    "loan_term_months": "Decision D-2: FinAware debts have no loan term",
    "loan_type": "Decision D-2: FinAware debt types do not map to the dataset's loan types",
}

# Why: savings ÷ expenses is undefined when expenses are 0. Cap instead of Infinity; no dataset record
# reaches the cap (max 397 months), so training data is unaffected.
SAVINGS_COVERAGE_CAP_MONTHS = 600.0

# Plain-language names (spec §29). Never show technical names to users.
DISPLAY_NAMES = {
    "age": "Age",
    "employment_status": "Employment status",
    "has_loan": "Having a loan",
    "monthly_income_zar": "Monthly income",
    "monthly_expenses_zar": "Monthly expenses",
    "savings_zar": "Savings",
    "credit_score": "Credit score",
    "loan_amount_zar": "Total debt balance",
    "monthly_emi_zar": "Monthly loan repayment",
    "loan_interest_rate_pct": "Loan interest rate",
    "debt_to_income_ratio": "Debt-to-income ratio",
    "savings_to_income_ratio": "Savings-to-income ratio",
    "disposable_income_zar": "Disposable income",
    "expense_to_income_ratio": "Expense-to-income ratio",
    "monthly_surplus_after_emi_zar": "Monthly surplus after loan repayment",
    "savings_coverage_months": "Savings coverage",
    "loan_to_income_ratio": "Loan-to-income ratio",
}

MODEL_DISPLAY_NAMES = {
    "random_forest": "Random Forest",
    "gradient_boosting": "Gradient Boosting",
    "knn": "K-Nearest Neighbours",
    "svm": "Support Vector Machine",
}
