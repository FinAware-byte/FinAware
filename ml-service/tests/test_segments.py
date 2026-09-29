"""Peer groups (feature 10): what they are built from, how a profile is placed, and the API."""

import pytest
from fastapi.testclient import TestClient

import api.main as api
from ml.config import ARTIFACT_DIR
from ml.segments import SEGMENT_FEATURES, K_RANGE, peer_population, train

requires_segments = pytest.mark.skipif(
    not (ARTIFACT_DIR / "segments.joblib").exists(), reason="peer groups not trained — run `python -m ml.segments`"
)


@pytest.fixture(scope="module")
def trained(dataset):
    return train(dataset)


def test_records_repaying_more_than_they_earn_are_left_out(dataset):
    population, excluded = peer_population(dataset)
    assert excluded > 0
    assert len(population) + excluded == len(dataset)
    assert (population["monthly_emi_zar"] <= population["monthly_income_zar"]).all()


def test_savings_are_compared_but_not_clustered_on():
    # Almost no training record holds under three months of savings, so clustering on savings
    # decided a real user's group by that alone.
    assert not any("saving" in feature for feature in SEGMENT_FEATURES)


def test_k_is_chosen_by_silhouette_and_every_record_has_a_group(trained):
    _, metadata = trained
    scores = {int(k): v for k, v in metadata["silhouetteByK"].items()}
    assert set(scores) == set(K_RANGE)
    assert metadata["k"] == max(scores, key=scores.get)
    assert sum(s["size"] for s in metadata["segments"]) == metadata["recordsUsed"]


def test_group_names_are_distinct(trained):
    _, metadata = trained
    names = [s["name"] for s in metadata["segments"]]
    assert len(set(names)) == len(names)


def test_training_is_deterministic(dataset, trained):
    _, first = trained
    _, second = train(dataset)
    assert [s["size"] for s in first["segments"]] == [s["size"] for s in second["segments"]]


@requires_segments
def test_a_profile_is_placed_and_positioned_within_its_group(sample_request):
    from ml.segments import Segmenter

    result = Segmenter().assign(sample_request)
    assert result["segment"]["name"]
    for metric in result["metrics"]:
        assert 0.0 <= metric["percentile"] <= 100.0
        assert metric["groupP25"] <= metric["groupMedian"] <= metric["groupP75"]


@requires_segments
def test_a_real_household_savings_level_is_flagged_as_outside_the_data(sample_request):
    from ml.segments import Segmenter

    # One month of expenses saved: normal for a household, rarer than anything in the dataset.
    result = Segmenter().assign({**sample_request, "savings_zar": sample_request["monthly_expenses_zar"] * 0.5})
    savings = next(m for m in result["metrics"] if m["key"] == "savings_months")
    assert savings["outsideGroup"] is True


@requires_segments
def test_segment_endpoint(sample_request):
    with TestClient(api.app) as client:
        body = client.post("/segment", json=sample_request).json()
        assert body["model"]["name"] == "KMeans"
        assert body["model"]["recordsExcluded"] > 0
        info = client.get("/model-info").json()["peerSegments"]
        assert info["available"] is True
        assert info["k"] == len(info["segments"])
        # Validation is the same as /predict: nothing is filled in silently.
        bad = client.post("/segment", json={k: v for k, v in sample_request.items() if k != "credit_score"})
        assert bad.status_code == 422
