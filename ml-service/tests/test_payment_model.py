"""Tests for the missed-payment model: panel construction, leakage, serving and the API."""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from api.main import app
from ml.payment.dataset import FEATURES, LABEL, MIN_PRIOR_PAYMENTS, build_panel, time_split

MONTH = 1000 * 60 * 60 * 24 * 30


def make_db(tmp_path, outcomes: list[int]):
    """A single user, one debt, with the given miss/pay sequence in date order."""
    path = tmp_path / "test.db"
    c = sqlite3.connect(path)
    c.executescript(
        """
        CREATE TABLE Users (user_id INTEGER PRIMARY KEY, monthly_income REAL, risk_level TEXT);
        CREATE TABLE Debts (debt_id INTEGER PRIMARY KEY, user_id INTEGER, creditor_name TEXT,
                            status TEXT, interest_rate REAL, balance REAL);
        CREATE TABLE Payment_History (payment_id INTEGER PRIMARY KEY, debt_id INTEGER,
                                      due_date INTEGER, paid INTEGER, missed INTEGER);
        """
    )
    c.execute("INSERT INTO Users VALUES (1, 20000, 'Medium')")
    c.execute("INSERT INTO Debts VALUES (1, 1, 'TestBank', 'Active', 10.0, 40000)")
    for i, missed in enumerate(outcomes):
        c.execute(
            "INSERT INTO Payment_History VALUES (?, 1, ?, ?, ?)",
            (i + 1, 1_700_000_000_000 + i * MONTH, 0 if missed else 1, missed),
        )
    c.commit()
    c.close()
    return path


def test_warm_up_payments_are_not_scored(tmp_path):
    panel = build_panel(make_db(tmp_path, [0] * 10))
    assert len(panel) == 10 - MIN_PRIOR_PAYMENTS


def test_features_use_only_earlier_payments(tmp_path):
    # Paid, paid, paid, paid, then missed: at the 5th payment nothing is known about a miss yet.
    panel = build_panel(make_db(tmp_path, [0, 0, 0, 0, 1, 1]))
    first = panel.iloc[0]
    assert first["prior_miss_rate"] == 0.0
    assert first["current_miss_streak"] == 0
    assert first[LABEL] == 0

    # The row after the first miss must see it, and the one after two misses a streak of 2.
    after_first_miss = panel.iloc[-1]
    assert after_first_miss["current_miss_streak"] == 1
    assert after_first_miss["prior_miss_rate"] > 0


def test_label_is_never_a_feature():
    assert LABEL not in FEATURES


def test_streak_resets_after_a_payment(tmp_path):
    panel = build_panel(make_db(tmp_path, [1, 1, 1, 1, 0, 1]))
    assert panel.iloc[-1]["current_miss_streak"] == 0  # last row follows a paid payment


def test_time_split_keeps_the_holdout_after_training(tmp_path):
    panel = build_panel(make_db(tmp_path, [0, 1] * 15))
    train, test = time_split(panel, 0.3)
    assert train["due_date"].max() <= test["due_date"].min()
    assert len(test) > 0


def test_zero_income_rows_are_dropped_not_imputed(tmp_path):
    path = make_db(tmp_path, [0] * 8)
    c = sqlite3.connect(path)
    c.execute("UPDATE Users SET monthly_income = 0")
    c.commit()
    c.close()
    with pytest.raises(ValueError):
        build_panel(path)


# --- serving -------------------------------------------------------------------------------

pytest.importorskip("joblib")


def payload(**overrides):
    debt = {
        "debt_id": 1,
        "creditor_name": "TestBank",
        "prior_payment_count": 20,
        "prior_miss_rate": 0.3,
        "recent6_miss_rate": 0.33,
        "current_miss_streak": 1,
        "months_since_last_miss": 1.0,
        "active_debt_count": 2,
        "debt_interest_rate_pct": 11.0,
        "debt_balance_to_income": 5.0,
        "total_balance_to_income": 8.0,
        "debt_status": "Active",
    }
    debt.update(overrides)
    return {"debts": [debt]}


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def test_payment_endpoint_returns_a_probability(client):
    response = client.post("/predict/payment-miss", json=payload())
    assert response.status_code == 200
    body = response.json()
    assert 0.0 <= body["anyMissedProbability"] <= 1.0
    assert body["band"] in {"Low", "Moderate", "High"}
    assert len(body["debts"]) == 1
    assert body["debts"][0]["topDrivers"]


def test_garnished_debt_scores_above_an_identical_active_one(client):
    active = client.post("/predict/payment-miss", json=payload(debt_status="Active")).json()
    garnished = client.post("/predict/payment-miss", json=payload(debt_status="Garnished")).json()
    assert garnished["anyMissedProbability"] > active["anyMissedProbability"]


def test_invalid_rate_is_rejected(client):
    response = client.post("/predict/payment-miss", json=payload(prior_miss_rate=1.5))
    assert response.status_code == 422
    assert response.json()["error"] == "INVALID_INPUT"


def test_empty_debt_list_is_rejected(client):
    assert client.post("/predict/payment-miss", json={"debts": []}).status_code == 422


def test_model_info_advertises_the_payment_model(client):
    info = client.get("/model-info").json()["paymentMissModel"]
    assert info["available"] is True
    assert info["labelSource"].startswith("Payment_History.missed")
    assert 0.0 < info["metrics"]["roc_auc"] <= 1.0
    # The model card compares the model with the simplest guesses it had to beat.
    baselines = info["evaluation"]["baselines"]
    assert baselines, "the baselines must be published alongside the model's own score"
    assert all(b["roc_auc"] < info["metrics"]["roc_auc"] for b in baselines.values())
