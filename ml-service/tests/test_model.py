"""Model tests (spec §45): artefacts load, probabilities are valid and mapped by class name."""

import math

import pytest

from ml.predict import Predictor, risk_score
from tests.conftest import requires_model

pytestmark = requires_model


@pytest.fixture(scope="module")
def predictor():
    return Predictor()


def test_artefacts_and_metadata(predictor):
    meta = predictor.metadata
    assert meta["class_order"] == ["Low", "Medium", "High"]
    assert meta["model_version"] == "1.0" and meta["target_version"] == "1.0"
    assert meta["random_state"] == 42


def test_prediction_is_valid(predictor, sample_request):
    result = predictor.predict(sample_request)
    probs = result["probabilities"]
    assert set(probs) == {"Low", "Medium", "High"}
    assert math.isclose(sum(probs.values()), 1.0, abs_tol=1e-5)
    assert result["riskLevel"] == max(probs, key=probs.get)
    assert result["riskScore"] == risk_score(probs)
    assert result["riskLevel"] == "Medium"  # matches the rubric: 3 points


def test_probabilities_are_mapped_by_name_not_position(predictor, sample_request):
    classes = list(predictor.pipeline.classes_)
    assert classes != ["Low", "Medium", "High"], "sklearn orders classes alphabetically"
    raw_proba = predictor.pipeline.predict_proba(__import__("pandas").DataFrame([sample_request]))[0]
    result = predictor.predict(sample_request)
    for label in ["Low", "Medium", "High"]:
        assert result["probabilities"][label] == pytest.approx(raw_proba[classes.index(label)], abs=1e-6)


def test_drivers_are_readable_and_signed(predictor, sample_request):
    drivers = predictor.predict(sample_request)["topDrivers"]
    assert 3 <= len(drivers) <= 5
    for d in drivers:
        assert "_" not in d["label"]
        assert d["direction"] in {"increases_risk", "decreases_risk"}
        assert d["influence"] in {"Significant", "Moderate", "Minor"}
    assert drivers == sorted(drivers, key=lambda d: -d["importance"])


def test_high_risk_profile_drivers_increase_risk(predictor, sample_request):
    stressed = {**sample_request, "monthly_emi_zar": 30000, "loan_amount_zar": 900000, "credit_score": 420, "savings_zar": 5000}
    result = predictor.predict(stressed)
    assert result["riskLevel"] == "High"
    assert result["topDrivers"][0]["direction"] == "increases_risk"


def test_risk_score_formula():
    assert risk_score({"Low": 0.08, "Medium": 0.72, "High": 0.20}) == 56.0
    assert risk_score({"Low": 1, "Medium": 0, "High": 0}) == 0.0
    assert risk_score({"Low": 0, "Medium": 0, "High": 1}) == 100.0


def test_runtime_modules_do_not_need_dev_dependencies():
    """The runtime image installs requirements.txt only — importing the API must not pull in matplotlib.

    Why: ml/evaluate.py imports matplotlib for the training reports; if a runtime module imports it, the
    container starts, crashes on import and every prediction returns 503.
    """
    import subprocess
    import sys
    import textwrap

    code = textwrap.dedent(
        """
        import sys
        for name in ("matplotlib", "pytest", "openpyxl"):
            sys.modules[name] = None  # importing any of these now raises ImportError
        import api.main  # noqa: F401
        print("ok")
        """
    )
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert "ok" in result.stdout, result.stderr[-800:]
