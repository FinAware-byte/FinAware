# FinAware ML Prediction Service

Internal Python service (FastAPI, port 8000) behind the **Assess Financial Risk** feature. It validates model
inputs, engineers features, predicts Low / Medium / High financial risk with class probabilities, and explains
each prediction with SHAP. Recommendations are **not** made here — the Financial API Service (Node) generates
them from this output, as drawn in the sequence diagram (`docs/uml/04-sequence-diagram.png`).

> The risk target is a **constructed** classification (`risk_target_version` 1.0), not a real outcome.
> It is **pending supervisor approval** — see `../docs/risk_tier_methodology.md`. Until then, training
> requires `--allow-proposed-target` and every artefact and result is labelled provisional.

## Layout

| Path | Purpose |
|---|---|
| `data/` | Dataset, provenance file and data dictionary (unchanged; checksums in `data/README.md`) |
| `ml/config.py` | Paths, feature lists (Decision D-2), display names |
| `ml/data_audit.py` | Data-quality checks → `reports/data_audit.md`. Reports, never alters |
| `ml/features.py` | Dataset ratios + engineered features (shared by training and inference) |
| `ml/target.py` | Constructed risk target rubric v1.0 |
| `ml/pipeline.py` | Feature engineering → scaling / one-hot → model |
| `ml/train.py`, `ml/evaluate.py` | Four models, CV grid search, test metrics, permutation importance, ablation, selection → `reports/model_comparison.md` |
| `ml/explain.py` | Per-user SHAP drivers (exact for Random Forest and Gradient Boosting) |
| `ml/predict.py` | Loads artefacts; probabilities by class name; riskScore; warnings |
| `api/main.py` | `POST /predict`, `GET /health/live`, `GET /health/ready`, `GET /model-info` |
| `artifacts/` | `pipeline.joblib`, `feature_schema.json`, `model_metadata.json` (built, not committed) |
| `tests/` | Data, feature, model and API tests (pytest) |

## Run locally

```bash
cd ml-service
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m ml.data_audit
.venv/bin/python -m ml.train --allow-proposed-target      # ~8 min on 8 cores; drop the flag after approval
.venv/bin/python -m pytest -q
.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
```

From the repository root, `npm run dev:stack:ml` starts the web app, all Node services and this service.

## API

`POST /predict` — every field required (nothing is silently filled in):

```json
{ "monthly_income_zar": 35000, "monthly_expenses_zar": 22000, "savings_zar": 85000, "credit_score": 650,
  "has_loan": "Yes", "loan_amount_zar": 180000, "monthly_emi_zar": 4200, "loan_interest_rate_pct": 12.5,
  "age": 32, "employment_status": "Employed" }
```

Response: `riskLevel`, `riskScore` (0–100 = 100 × (0.5·P(Medium) + P(High))), `probabilities`
`{Low, Medium, High}`, `topDrivers` (feature, label, importance share, influence band, direction, value),
`indicators`, `model {name, version}`, `targetVersion`, `targetStatus`, `warnings`.

| Error | HTTP | When |
|---|---|---|
| `INVALID_INPUT` | 422 | Missing field, wrong type, out-of-range value, `has_loan: "No"` with loan values, malformed JSON |
| `MODEL_UNAVAILABLE` | 503 | Artefacts missing or not loaded |
| `PREDICTION_FAILED` | 500 | Unexpected failure, or probabilities fail validation |
| warning `UNKNOWN_CATEGORY` | 200 | Category not seen in training — still predicted, treated as neutral |
| warning `OUTSIDE_TRAINING_RANGE` | 200 | Numeric input outside the training data range — less reliable |

## Docker

`Dockerfile` is multi-stage: it trains the model in a build stage (seed 42) and ships a slim runtime image
(~750 MB) that runs as a non-root user with the model baked in and a health check on `/health/ready`.

```bash
# Default: train during the build — reproducible, used by Compose.
docker build --build-arg ALLOW_PROPOSED_TARGET=1 -t finaware-ml:latest ml-service

# Fast local/dev build: reuse ml-service/artifacts from an earlier `python -m ml.train` (~30 s).
docker build --build-arg ARTIFACT_STAGE=prebuilt -t finaware-ml:latest ml-service
```

`ALLOW_PROPOSED_TARGET=1` is required while the risk target is unapproved — without it the build stops with
the reason. Training inside a small VM is much slower than on the host (Random Forest alone took ~22 min on
an 8-core OrbStack VM versus ~50 s natively), so prefer `ARTIFACT_STAGE=prebuilt` locally.

Runtime dependencies are `requirements.txt` only; `ml/evaluate.py` (matplotlib) is training-only. A test
(`tests/test_model.py::test_runtime_modules_do_not_need_dev_dependencies`) keeps the API import graph free of
dev-only packages.
