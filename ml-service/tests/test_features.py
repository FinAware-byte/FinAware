"""Feature tests (spec §45): engineered values against hand-calculated examples, incl. division by zero."""

import pandas as pd
import pytest

from ml.config import MODEL_CATEGORICAL, MODEL_NUMERIC, SAVINGS_COVERAGE_CAP_MONTHS
from ml.features import build_features, dataset_ratios
from ml.target import build_target, score

ROW = {
    "age": 32, "employment_status": "Employed", "monthly_income_zar": 35000.0, "monthly_expenses_zar": 22000.0,
    "savings_zar": 85000.0, "has_loan": "Yes", "loan_amount_zar": 180000.0, "monthly_emi_zar": 4200.0,
    "loan_interest_rate_pct": 12.5, "credit_score": 650,
}


def features(**overrides):
    return build_features(pd.DataFrame([{**ROW, **overrides}])).iloc[0]


def test_hand_calculated_example():
    f = features()
    assert f.disposable_income_zar == 13000                       # 35 000 − 22 000
    assert f.expense_to_income_ratio == pytest.approx(22000 / 35000)
    assert f.monthly_surplus_after_emi_zar == 8800                # 35 000 − 22 000 − 4 200
    assert f.savings_coverage_months == pytest.approx(85000 / 22000)
    assert f.loan_to_income_ratio == pytest.approx(180000 / 420000)
    assert f.debt_to_income_ratio == 0.12                         # EMI ÷ income, 2 dp
    assert f.savings_to_income_ratio == 0.2                       # 85 000 ÷ 420 000 = 0.202 → 0.20


def test_column_order_is_fixed():
    assert list(features().index) == MODEL_NUMERIC + MODEL_CATEGORICAL


def test_zero_expenses_uses_documented_cap_not_infinity():
    f = features(monthly_expenses_zar=0)
    assert f.savings_coverage_months == SAVINGS_COVERAGE_CAP_MONTHS
    assert f.expense_to_income_ratio == 0


def test_zero_or_negative_income_is_rejected():
    with pytest.raises(ValueError):
        features(monthly_income_zar=0)


def test_missing_input_is_rejected_not_imputed():
    raw = pd.DataFrame([{k: v for k, v in ROW.items() if k != "credit_score"}])
    with pytest.raises(ValueError, match="credit_score"):
        build_features(raw)


def test_recomputed_ratios_match_dataset(dataset):
    ratios = dataset_ratios(dataset)
    assert (ratios.debt_to_income_ratio - dataset.debt_to_income_ratio).abs().max() <= 0.011
    assert (ratios.savings_to_income_ratio - dataset.savings_to_income_ratio).abs().max() <= 0.011


def test_target_rubric_on_example():
    pts = score(pd.DataFrame([ROW])).iloc[0]
    # expense ratio 0.63 → 1, credit 650 → 1, coverage 3.9 months → 1; repayment 0.12 → 0, surplus 25% → 0
    assert pts.risk_points == 3
    assert pts.risk_tier == "Medium"


def test_target_distribution_is_reproducible(dataset):
    counts = build_target(dataset).value_counts().to_dict()
    assert counts == {"Low": 14246, "Medium": 11476, "High": 6702}
