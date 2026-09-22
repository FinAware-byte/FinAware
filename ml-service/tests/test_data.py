"""Data tests (spec §45): the dataset matches the dictionary and is never silently altered."""

from ml.config import CATEGORY_VALUES, EXPECTED_COLUMNS, USD_TO_ZAR, ZAR_USD_PAIRS
from ml.data_audit import run_checks


def test_shape_and_columns(dataset):
    assert dataset.shape == (32_424, 24)
    assert list(dataset.columns) == EXPECTED_COLUMNS


def test_no_missing_or_duplicates(dataset):
    assert dataset.isna().sum().sum() == 0
    assert not dataset.duplicated().any()


def test_categories_match_dictionary(dataset):
    for column, allowed in CATEGORY_VALUES.items():
        assert set(dataset[column].unique()) == set(allowed), column


def test_zar_is_usd_times_rate(dataset):
    for zar, usd in ZAR_USD_PAIRS.items():
        assert (dataset[zar] - (dataset[usd] * USD_TO_ZAR).round(2)).abs().max() <= 0.011, zar


def test_no_loan_means_no_loan_values(dataset):
    no_loan = dataset[dataset.has_loan == "No"]
    assert (no_loan.loan_type == "No Loan").all()
    assert (no_loan[["loan_amount_zar", "monthly_emi_zar", "loan_term_months", "loan_interest_rate_pct"]] == 0).all().all()


def test_full_audit_passes_and_does_not_modify(dataset):
    before = dataset.copy()
    checks = run_checks(dataset)
    assert all(c.passed for c in checks), [c for c in checks if not c.passed]
    assert dataset.equals(before)
