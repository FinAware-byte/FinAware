# Specification §52 — Final developer checklist, with evidence

Status of every checklist item, with a link to the file, report or test that proves it. Paths are relative to
the repository root. Commands to reproduce the reports are in `ml-service/README.md`.

Legend: **Done** · **Done (provisional)** — correct but re-run after the risk target is approved · **Open**

## Data

| Item | Status | Evidence |
|---|---|---|
| Dataset integrated | Done | `ml-service/data/` + checksums in `ml-service/data/README.md` |
| 32,424 records verified | Done | `ml-service/reports/data_audit.md` check 1; `tests/test_data.py::test_shape_and_columns` |
| Data dictionary reviewed | Done | `docs/ml/ML_METHODOLOGY.md` §2; categories checked against the dictionary (audit checks 8–13) |
| Data types validated | Done | Audit check 6 |
| Missing values checked | Done | Audit check 3 (0 missing) |
| Duplicate records checked | Done | Audit check 4 (0 duplicates) |
| ZAR fields used appropriately | Done | Audit checks 22–26 (ZAR = USD × 16.27) |
| USD duplicate fields excluded from ML features | Done | `ml-service/ml/config.py` `EXCLUDED_FROM_FEATURES` |

## Target

| Item | Status | Evidence |
|---|---|---|
| Risk target defined | Done (provisional) | `ml-service/ml/target.py` (`risk_target_version` 1.0) |
| Low/Medium/High documented | Done | `docs/risk_tier_methodology.md` §2 |
| Target-generation methodology documented | Done | `docs/risk_tier_methodology.md` (indicators, thresholds, cut-points, rationale) |
| Class distribution reported | Done | Methodology §3 — Low 43.94% / Medium 35.39% / High 20.67%; `tests/test_features.py::test_target_distribution_is_reproducible` |
| Target leakage assessed | Done | Methodology §5 (circularity) + the ablation in `reports/model_comparison.md` |
| **Supervisor approval** | **Open** | Sign-off table in `docs/risk_tier_methodology.md` §7 |

## Features

| Item | Status | Evidence |
|---|---|---|
| Feature engineering implemented | Done | `ml-service/ml/features.py` |
| Ratios validated | Done | Audit checks 29–30; `tests/test_features.py::test_recomputed_ratios_match_dataset` |
| Division by zero handled | Done | `features.py` (coverage cap); `tests/test_features.py::test_zero_expenses_uses_documented_cap_not_infinity` |
| Duplicate features removed | Done | No `emi_to_income_ratio` / `debt_zar` / `loan_burden_zar` (spec §13.3, §16) — `ml/config.py` |
| Feature schema documented | Done | `ml-service/artifacts/feature_schema.json`; `docs/ml/feature_mapping.md` |

## Preprocessing

| Item | Status | Evidence |
|---|---|---|
| Train/test split implemented | Done | `ml/train.py` — 80/20, 25,939 / 6,485 |
| Stratification used | Done | `train_test_split(..., stratify=y)` |
| Categorical encoding implemented | Done | `OneHotEncoder(handle_unknown="ignore")` in `ml/pipeline.py` |
| Numerical scaling implemented | Done | `StandardScaler` in `ml/pipeline.py` |
| No preprocessing leakage | Done | Everything is inside the Pipeline, fitted on the training split only (Methodology §4) |
| Reusable pipeline created | Done | `ml-service/artifacts/pipeline.joblib` — the same object serves training and inference |

## Models

| Item | Status | Evidence |
|---|---|---|
| Random Forest implemented | Done (provisional) | `reports/model_comparison.md` |
| Gradient Boosting implemented | Done (provisional) | Same |
| KNN implemented | Done (provisional) | Same |
| SVM implemented | Done (provisional) | Same (calibrated probabilities) |
| All four evaluated | Done (provisional) | Same — identical split and metrics |
| Confusion matrices produced | Done (provisional) | `reports/confusion_*.png` + tables in the report |
| Accuracy / Precision / Recall / F1 / Macro F1 reported | Done (provisional) | Report tables (also weighted F1 and per-class) |
| Final model documented | Done (provisional) | Report §"Final model selection" — Gradient Boosting, rule fixed before training |

## Prediction

| Item | Status | Evidence |
|---|---|---|
| Risk tier returned | Done | `ml/predict.py`; `tests/test_model.py::test_prediction_is_valid` |
| Low / Medium / High probabilities returned | Done | Same |
| Probabilities validated | Done | Sum ≈ 1 and tier = argmax, in the service and again in the Financial API (`assess.ts`) |
| Model version returned | Done | `model_metadata.json` → response `model` + `targetVersion`, stored per assessment |

## Explainability

| Item | Status | Evidence |
|---|---|---|
| Top drivers calculated | Done | `ml/explain.py` (SHAP) |
| Drivers mapped to human-readable labels | Done | `ml/config.py` `DISPLAY_NAMES`; `tests/test_model.py::test_drivers_are_readable_and_signed` |
| Appropriate method used for each model | Done | SHAP for the selected tree model; permutation importance for all four (Methodology §8) |
| Drivers presented in UI | Done | `components/risk/risk-result.tsx` — "What is influencing your result?" |
| No causal claims made | Done | UI wording: "Factors influencing this prediction… not what caused your situation" |

## Recommendations

| Item | Status | Evidence |
|---|---|---|
| Rule-based engine implemented | Done | `services/financial-api/src/recommendations.ts` |
| Risk-specific rules implemented | Done | `recommendation-rules.ts` — tier rules for Low/Medium/High |
| Driver-specific rules implemented | Done | Same — driver rules fire only on risk-increasing drivers |
| Recommendations traceable to prediction | Done | `trace_json` per recommendation (rule, tier, driver, user value); `tests/risk/recommendations.test.ts` |
| OpenAI dependency removed from recommendation generation | Done | No LLM in this flow. The existing Rehab page keeps its own feature (spec §48 — see `docs/ml/ML_METHODOLOGY.md` §9) |

## Backend

| Item | Status | Evidence |
|---|---|---|
| ML endpoint implemented | Done | `ml-service/api/main.py` — `POST /predict` |
| Input validation implemented | Done | Pydantic (ML) + Zod (Financial API); `tests/test_api.py`, `tests/risk/validation.test.ts` |
| Error handling implemented | Done | Structured codes; `tests/test_api.py`, `tests/risk/assess.test.ts` |
| ML service integrated with Node backend | Done | `services/financial-api/src/assess.ts` (sequence-diagram order asserted by test) |
| Prediction results persisted | Done | `Risk_Assessment` + `Risk_Driver` + `Recommendation` via the Financial Data Service |

## Frontend

| Item | Status | Evidence |
|---|---|---|
| Risk tier displayed | Done | `/risk-assessment` — "<Level> Financial Risk" |
| Probability distribution displayed | Done | Bar + whole-number percentages that total 100 (`lib/risk/format.ts`) |
| Top drivers displayed | Done | Numbered list with influence bands |
| Recommendations displayed | Done | Titles, descriptions, reasons and priorities |
| User-friendly terminology used | Done | No technical feature names reach the UI |
| Loading / error states implemented | Done | "Assessing…", error card with **Retry assessment**, verified in the browser |

## Infrastructure

| Item | Status | Evidence |
|---|---|---|
| ML service containerised | Done | `ml-service/Dockerfile` — multi-stage, non-root (uid 10001), health check. Built and run: prediction + healthy status verified |
| Kubernetes deployment configured | Done (not yet deployed) | Helm values/templates + `deploy/k8s/microservices.yaml`; `helm lint` and `helm template` pass for dev/stag/prod, existing resources byte-identical. A cluster install is still outstanding |
| Service networking configured | Done | ClusterIP only; NetworkPolicy allows just `financial-api` → `ml-service`; the Ingress still exposes only the web app |
| Environment configuration documented | Done | `.env.example`, README "Environment Variables", Helm ConfigMap |
| Model artefacts included appropriately | Done | Baked into the image at build time; `artifacts/` is git-ignored, never served |

## Testing

| Item | Status | Evidence |
|---|---|---|
| Data tests | Done | `ml-service/tests/test_data.py` |
| Feature tests | Done | `ml-service/tests/test_features.py` (hand-calculated examples) |
| Model tests | Done | `ml-service/tests/test_model.py` |
| API tests | Done | `ml-service/tests/test_api.py` |
| End-to-end prediction test | Done | Browser walk-through of both activity-diagram branches + `tests/risk/assess.test.ts`; existing pages re-checked |
| CI | Done | `.github/workflows/ci.yml` — lint, typecheck, build, `npm test`, and a Python job (audit, train, pytest) |

## Open items

1. **Supervisor approval of the risk target** (§18–19) — then re-run `python -m ml.train` without
   `--allow-proposed-target`; the reports and artefacts regenerate and lose the "provisional" labels.
2. **Kubernetes install on a cluster** — templates verified offline; the local OrbStack cluster was
   unhealthy (unrelated workloads) at the time of testing.
3. **Remove `developerhandoffpackagefolder/`** once its contents are confirmed superseded by `ml-service/`.
