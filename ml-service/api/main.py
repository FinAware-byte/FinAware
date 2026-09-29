"""FinAware ML Prediction Service — internal FastAPI app on port 8000 (spec §34–35, §41, §43).

Endpoints: POST /predict · GET /health/live · GET /health/ready · GET /model-info
Every error is structured JSON: {"error": CODE, "message": ..., "details": [...]}.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ml.config import ARTIFACT_DIR
from ml.payment.predict import PaymentModelUnavailable, PaymentPredictor
from ml.predict import PredictionFailed, Predictor, to_native
from ml.segments import Segmenter, SegmentsUnavailable
from ml.whatif import distance_to_better_tier

log = logging.getLogger("finaware-ml")
ARTIFACTS = Path(os.getenv("FINAWARE_ARTIFACT_DIR", str(ARTIFACT_DIR)))
state: dict = {
    "predictor": None,
    "load_error": None,
    "payment": None,
    "payment_load_error": None,
    "segments": None,
    "segments_load_error": None,
}


def load_predictor() -> None:
    try:
        state["predictor"] = Predictor(ARTIFACTS)
        state["load_error"] = None
        log.info("Model loaded: %s", state["predictor"].metadata["model"])
    except Exception as exc:  # noqa: BLE001 — service stays up and reports not-ready
        state["predictor"] = None
        state["load_error"] = str(exc)
        log.error("Model not loaded: %s", exc)


def load_payment_predictor() -> None:
    """The missed-payment model is optional: an image built without its artefact still serves
    the risk tier, and /health/ready stays green. Only its own endpoint reports 503."""
    try:
        state["payment"] = PaymentPredictor(ARTIFACTS)
        state["payment_load_error"] = None
        log.info("Missed-payment model loaded: %s", state["payment"].metadata["model"])
    except Exception as exc:  # noqa: BLE001
        state["payment"] = None
        state["payment_load_error"] = str(exc)
        log.warning("Missed-payment model not loaded: %s", exc)


def load_segmenter() -> None:
    """Peer groups are optional, like the missed-payment model: without them the risk model still serves."""
    try:
        state["segments"] = Segmenter(ARTIFACTS)
        state["segments_load_error"] = None
        log.info("Peer groups loaded: k=%s", state["segments"].metadata["k"])
    except (SegmentsUnavailable, Exception) as exc:  # noqa: BLE001
        state["segments"] = None
        state["segments_load_error"] = str(exc)
        log.warning("Peer groups not loaded: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_predictor()
    load_payment_predictor()
    load_segmenter()
    yield


app = FastAPI(title="FinAware ML Prediction Service", version="1.0.0", lifespan=lifespan)


class FinancialFeatures(BaseModel):
    """Required model inputs. Nothing is filled in silently (defect D10).

    Ratios such as debt_to_income_ratio are calculated here from these values; any client-supplied
    ratio is ignored.
    """

    model_config = ConfigDict(extra="ignore")

    monthly_income_zar: float = Field(..., gt=0)
    monthly_expenses_zar: float = Field(..., ge=0)
    savings_zar: float = Field(..., ge=0)
    credit_score: float = Field(..., ge=300, le=850)
    has_loan: Literal["Yes", "No"]
    loan_amount_zar: float = Field(..., ge=0)
    monthly_emi_zar: float = Field(..., ge=0)
    loan_interest_rate_pct: float = Field(..., ge=0, le=100)
    age: float = Field(..., ge=16, le=100)
    employment_status: str = Field(..., min_length=1, max_length=40)

    @model_validator(mode="after")
    def loan_fields_consistent(self):
        if self.has_loan == "No" and (self.loan_amount_zar > 0 or self.monthly_emi_zar > 0):
            raise ValueError("has_loan is 'No' but loan_amount_zar or monthly_emi_zar is above 0")
        return self


def error(status: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    body = {"error": code, "message": message}
    if details:
        body["details"] = details
    return JSONResponse(status_code=status, content=body)


@app.exception_handler(RequestValidationError)
async def on_validation_error(_request: Request, exc: RequestValidationError):
    details = [
        {"field": "body", "message": "Request body is not valid JSON"}
        if e["type"] == "json_invalid"
        else {"field": ".".join(str(p) for p in e["loc"] if p != "body") or "body", "message": e["msg"]}
        for e in exc.errors()
    ]
    first = details[0]
    return error(422, "INVALID_INPUT", f"{first['field']}: {first['message']}", details)


@app.get("/health/live")
def live():
    return {"status": "ok", "service": "ml-service"}


@app.get("/health/ready")
def ready():
    if state["predictor"] is None:
        return error(503, "MODEL_UNAVAILABLE", state["load_error"] or "Model not loaded")
    return {"status": "ready", "service": "ml-service", "model": state["predictor"].metadata["model"]}


@app.get("/model-info")
def model_info():
    predictor = state["predictor"]
    if predictor is None:
        return error(503, "MODEL_UNAVAILABLE", state["load_error"] or "Model not loaded")
    m = predictor.metadata
    # Why: metadata only — never the model file, paths or environment (spec §44).
    return {
        "model": {"name": m["model"], "version": m["model_version"]},
        "target": {"name": m["target"], "version": m["target_version"], "status": m["target_status"]},
        "classOrder": m["class_order"],
        "inputs": predictor.schema["inputs"],
        "trainedAt": m["trained_at"],
        "metrics": {k: m["metrics"][k] for k in ("accuracy", "f1_macro", "f1_weighted")},
        "riskScoreFormula": m["risk_score_formula"],
        "explanationMethod": predictor.explainer.method,
        # For the model card: how it was tested, from the same metadata file the model was saved with.
        "evaluation": {
            "trainRows": m.get("train_rows"),
            "testRows": m.get("test_rows"),
            "highRiskRecall": m["metrics"]["per_class"]["High"]["recall"],
            "meanTopProbability": m["metrics"].get("mean_max_probability"),
        },
        "paymentMissModel": _payment_model_info(),
        "peerSegments": _segments_info(),
    }


def _segments_info() -> dict:
    segmenter = state["segments"]
    if segmenter is None:
        return {"available": False, "reason": state["segments_load_error"] or "not loaded"}
    m = segmenter.metadata
    return {
        "available": True,
        "model": {"name": m["model"], "version": m["version"]},
        "k": m["k"],
        "silhouette": m["silhouette"],
        "recordsUsed": m["recordsUsed"],
        "recordsExcluded": m["recordsExcluded"],
        "exclusionRule": m["exclusionRule"],
        "trainedAt": m["trainedAt"],
        "segments": [{"name": s["name"], "share": s["share"]} for s in m["segments"]],
    }


def _payment_model_info() -> dict:
    """The second model, trained on a recorded outcome rather than a constructed target."""
    payment = state["payment"]
    if payment is None:
        return {"available": False, "reason": state["payment_load_error"] or "not loaded"}
    m = payment.metadata
    return {
        "available": True,
        "model": {"name": m["model"], "version": m["model_version"]},
        "task": m["task"],
        "labelSource": m["label_source"],
        "decisionThreshold": payment.threshold,
        "trainedAt": m["trained_at"],
        "metrics": {k: m["metrics"][k] for k in ("roc_auc", "average_precision", "brier")},
        "beatsPastMissRateHeuristic": m["beats_past_miss_rate_heuristic"],
        # For the model card: what "better than chance" is measured against, and what the
        # threshold catches. The baselines are the two simplest guesses the model had to beat.
        "evaluation": {
            "trainRows": m.get("train_rows"),
            "testRows": m.get("test_rows"),
            "testMissRate": m.get("test_miss_rate"),
            "precisionAtThreshold": m["metrics"].get("precision"),
            "recallAtThreshold": m["metrics"].get("recall"),
            "baselines": {
                name: {"roc_auc": result.get("roc_auc"), "average_precision": result.get("average_precision")}
                for name, result in m.get("all_results", {}).items()
                if name.startswith("Baseline")
            },
        },
    }


@app.post("/what-if")
def what_if(features: FinancialFeatures):
    """What would have to change to reach a better tier. Answered by scoring candidate values
    through the same model, so the numbers cannot drift from what /predict would say."""
    predictor = state["predictor"]
    if predictor is None:
        return error(503, "MODEL_UNAVAILABLE", "The risk model is not available. Please try again later.")
    try:
        return to_native(distance_to_better_tier(predictor.pipeline, features.model_dump()))
    except Exception as exc:  # noqa: BLE001 — surfaced as a structured error like /predict
        log.exception("What-if failed")
        return error(500, "PREDICTION_FAILED", "The what-if calculation could not be completed.", [{"reason": str(exc)}])


class DebtPaymentFeatures(BaseModel):
    """One active debt, with behaviour computed by the Financial Data Service from
    Payment_History. The service never reads the database itself (spec §36-38)."""

    model_config = ConfigDict(extra="ignore")

    debt_id: int | None = None
    creditor_name: str | None = Field(default=None, max_length=120)
    prior_payment_count: int = Field(..., ge=0)
    prior_miss_rate: float = Field(..., ge=0, le=1)
    recent6_miss_rate: float = Field(..., ge=0, le=1)
    current_miss_streak: int = Field(..., ge=0)
    months_since_last_miss: float = Field(..., ge=0)
    active_debt_count: int = Field(..., ge=0)
    debt_interest_rate_pct: float = Field(..., ge=0, le=100)
    debt_balance_to_income: float = Field(..., ge=0)
    total_balance_to_income: float = Field(..., ge=0)
    debt_status: str = Field(..., min_length=1, max_length=40)


class PaymentMissRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    debts: list[DebtPaymentFeatures] = Field(..., min_length=1, max_length=50)


@app.post("/segment")
def segment(features: FinancialFeatures):
    """Which peer group this profile falls in, and where it sits within that group."""
    segmenter = state["segments"]
    if segmenter is None:
        return error(503, "MODEL_UNAVAILABLE", "Peer groups are not available right now.")
    try:
        return to_native(segmenter.assign(features.model_dump()))
    except Exception as exc:  # noqa: BLE001 — surfaced as a structured error like /predict
        log.exception("Peer grouping failed")
        return error(500, "PREDICTION_FAILED", "Your peer group could not be worked out.", [{"reason": str(exc)}])


@app.post("/predict/payment-miss")
def predict_payment_miss(request: PaymentMissRequest):
    predictor = state["payment"]
    if predictor is None:
        return error(
            503,
            "MODEL_UNAVAILABLE",
            "The missed-payment model is not available. Please try again later.",
        )
    try:
        return to_native(predictor.predict([d.model_dump() for d in request.debts]))
    except (PaymentModelUnavailable, ValueError) as exc:
        log.exception("Missed-payment prediction failed")
        return error(
            500,
            "PREDICTION_FAILED",
            "The missed-payment prediction could not be completed.",
            [{"reason": str(exc)}],
        )


@app.post("/predict")
def predict(features: FinancialFeatures):
    predictor = state["predictor"]
    if predictor is None:
        return error(503, "MODEL_UNAVAILABLE", "The risk model is not available. Please try again later.")
    try:
        return to_native(predictor.predict(features.model_dump()))
    except PredictionFailed as exc:
        log.exception("Prediction failed")
        return error(500, "PREDICTION_FAILED", "The risk prediction could not be completed.", [{"reason": str(exc)}])
