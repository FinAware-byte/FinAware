"""API tests (spec §45): valid, invalid, missing field, wrong type, unknown category, model unavailable."""

import pytest
from fastapi.testclient import TestClient

import api.main as api
from tests.conftest import requires_model


@pytest.fixture()
def client():
    with TestClient(api.app) as c:
        yield c


@requires_model
def test_valid_request(client, sample_request):
    r = client.post("/predict", json=sample_request)
    assert r.status_code == 200
    body = r.json()
    assert body["riskLevel"] in {"Low", "Medium", "High"}
    assert body["model"]["version"] == "1.0"
    assert body["warnings"] == []


@requires_model
def test_client_supplied_ratio_is_ignored(client, sample_request):
    r1 = client.post("/predict", json=sample_request).json()
    r2 = client.post("/predict", json={**sample_request, "debt_to_income_ratio": 99}).json()
    assert r1["probabilities"] == r2["probabilities"]


@requires_model
def test_missing_field(client, sample_request):
    body = {k: v for k, v in sample_request.items() if k != "credit_score"}
    r = client.post("/predict", json=body)
    assert r.status_code == 422
    assert r.json()["error"] == "INVALID_INPUT"
    assert r.json()["details"][0]["field"] == "credit_score"


@requires_model
@pytest.mark.parametrize("field,value", [("monthly_income_zar", -1), ("monthly_income_zar", 0), ("credit_score", 900), ("has_loan", "Maybe")])
def test_invalid_values(client, sample_request, field, value):
    r = client.post("/predict", json={**sample_request, field: value})
    assert r.status_code == 422 and r.json()["error"] == "INVALID_INPUT"


@requires_model
def test_wrong_type_and_malformed_json(client, sample_request):
    assert client.post("/predict", json={**sample_request, "savings_zar": "lots"}).status_code == 422
    r = client.post("/predict", content="{bad", headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and r.json()["details"][0]["field"] == "body"


@requires_model
def test_inconsistent_loan_fields(client, sample_request):
    r = client.post("/predict", json={**sample_request, "has_loan": "No"})
    assert r.status_code == 422


@requires_model
def test_unknown_category_still_predicts_with_warning(client, sample_request):
    r = client.post("/predict", json={**sample_request, "employment_status": "Pensioner"})
    assert r.status_code == 200
    assert {"code": "UNKNOWN_CATEGORY", "field": "employment_status"}.items() <= r.json()["warnings"][0].items()


def test_model_unavailable(tmp_path, monkeypatch, sample_request):
    monkeypatch.setattr(api, "ARTIFACTS", tmp_path)
    with TestClient(api.app) as c:
        assert c.get("/health/live").status_code == 200
        ready = c.get("/health/ready")
        assert ready.status_code == 503 and ready.json()["error"] == "MODEL_UNAVAILABLE"
        r = c.post("/predict", json=sample_request)
        assert r.status_code == 503 and r.json()["error"] == "MODEL_UNAVAILABLE"


@requires_model
def test_model_info_exposes_metadata_only(client):
    body = client.get("/model-info").json()
    assert body["classOrder"] == ["Low", "Medium", "High"]
    assert "path" not in str(body).lower() and "joblib" not in str(body)
