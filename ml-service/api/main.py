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
from ml.predict import PredictionFailed, Predictor, to_native

log = logging.getLogger("finaware-ml")
ARTIFACTS = Path(os.getenv("FINAWARE_ARTIFACT_DIR", str(ARTIFACT_DIR)))
state: dict = {"predictor": None, "load_error": None}


def load_predictor() -> None:
    try:
        state["predictor"] = Predictor(ARTIFACTS)
        state["load_error"] = None
        log.info("Model loaded: %s", state["predictor"].metadata["model"])
    except Exception as exc:  # noqa: BLE001 — service stays up and reports not-ready
        state["predictor"] = None
        state["load_error"] = str(exc)
        log.error("Model not loaded: %s", exc)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_predictor()
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
    }


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
