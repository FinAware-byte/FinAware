# FinAware ML Developer Handoff

Developer-ready implementation for preprocessing, feature engineering, risk-tier target creation, four classifiers, evaluation, probabilities, explainability, rule-based recommendations, FastAPI inference, Node/Express integration, and Kubernetes deployment.

## Architecture

Next.js/React -> Node/Express financial microservice -> Python FastAPI ML service -> saved scikit-learn model -> prediction + probabilities + explainability + recommendations -> Node -> frontend.

## Quick start

```bash
cd finaware-ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python train.py --data data/personal_finance_zar.csv
uvicorn api:app --host 0.0.0.0 --port 8001
```

Test:
```bash
curl http://localhost:8001/health
curl -X POST http://localhost:8001/predict -H 'Content-Type: application/json' --data @sample_request.json
```

The source dataset does not contain an official FinAware `risk_tier`; this package derives an application-defined financial-health target. See `docs/risk_tier_methodology.md`.
