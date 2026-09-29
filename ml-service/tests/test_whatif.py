"""Tests for the what-if levers: the numbers must be ones the model itself agrees with."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app
from ml.predict import Predictor
from ml.proba import ordered_proba
from ml.target import RISK_LABELS
from ml.whatif import TIER_RANK, distance_to_better_tier

import pandas as pd

from ml.config import RAW_INPUTS

STRESSED = {
    "monthly_income_zar": 45000,
    "monthly_expenses_zar": 32000,
    "savings_zar": 25000,
    "credit_score": 590,
    "has_loan": "Yes",
    "loan_amount_zar": 480000,
    "monthly_emi_zar": 14000,
    "loan_interest_rate_pct": 16.5,
    "age": 34,
    "employment_status": "Salaried",
}


@pytest.fixture(scope="module")
def predictor():
    return Predictor()


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def predict_level(pipeline, payload: dict) -> str:
    frame = pd.DataFrame([{k: payload[k] for k in RAW_INPUTS}])
    proba = ordered_proba(pipeline, frame)[0]
    return RISK_LABELS[int(proba.argmax())]


def test_target_is_one_tier_better_than_current(predictor):
    result = distance_to_better_tier(predictor.pipeline, STRESSED)
    if result["targetLevel"] is None:
        pytest.skip("profile is already in the best tier")
    assert TIER_RANK[result["targetLevel"]] == TIER_RANK[result["currentLevel"]] - 1


def test_every_reported_change_actually_works(predictor):
    """The whole point: apply the suggested value and the model must agree."""
    result = distance_to_better_tier(predictor.pipeline, STRESSED)
    reachable = [lever for lever in result["levers"] if lever["reachable"]]
    assert reachable, "a stressed profile should have at least one workable lever"

    for lever in reachable:
        applied = {**STRESSED, lever["field"]: lever["requiredValue"]}
        assert predict_level(predictor.pipeline, applied) == lever["resultingLevel"]
        assert TIER_RANK[lever["resultingLevel"]] < TIER_RANK[result["currentLevel"]]


def test_a_smaller_change_is_not_enough(predictor):
    """The reported figure is the smallest on its grid, so backing off one step must fail."""
    result = distance_to_better_tier(predictor.pipeline, STRESSED)
    for lever in [l for l in result["levers"] if l["reachable"]]:
        current = lever["currentValue"]
        # Half way from today's value to the reported one.
        halfway = current + (lever["requiredValue"] - current) / 2
        level = predict_level(predictor.pipeline, {**STRESSED, lever["field"]: halfway})
        assert TIER_RANK[level] >= TIER_RANK[lever["resultingLevel"]]


def test_directions_make_sense(predictor):
    result = distance_to_better_tier(predictor.pipeline, STRESSED)
    for lever in result["levers"]:
        if not lever["reachable"]:
            continue
        if lever["direction"] == "increase":
            assert lever["requiredValue"] > lever["currentValue"]
        else:
            assert lever["requiredValue"] < lever["currentValue"]


def test_income_is_never_offered_as_a_lever(predictor):
    result = distance_to_better_tier(predictor.pipeline, STRESSED)
    assert all(lever["field"] != "monthly_income_zar" for lever in result["levers"])


def test_endpoint_matches_predict(client):
    what_if = client.post("/what-if", json=STRESSED)
    predicted = client.post("/predict", json=STRESSED)
    assert what_if.status_code == 200
    assert what_if.json()["currentLevel"] == predicted.json()["riskLevel"]


def test_endpoint_validates_like_predict(client):
    assert client.post("/what-if", json={**STRESSED, "credit_score": 9000}).status_code == 422
