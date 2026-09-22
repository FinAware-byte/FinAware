# FinAware — Machine Learning Methodology

This document explains how FinAware's ML Financial Risk Assessment was built, how it is justified, and its
limitations. It is written so an examiner can trace **dataset → target → model → prediction → UI** from the
documents alone.

> **Status.** The constructed risk target (`risk_tier` v1.0) is **awaiting supervisor approval**. The figures
> below come from a provisional training run (21 Sept 2026, `python -m ml.train --allow-proposed-target`).
> After approval the model is retrained with the same command minus the flag, and `reports/model_comparison.md`
> is regenerated. The figures are expected to stay the same unless the rubric changes.

**FinAware** is an interactive, machine-learning-based personal finance decision-support system. It predicts
financial risk, gives the probability of each risk level, explains the financial factors that influenced
the prediction, and generates rule-based recommendations (specification §50b). It is not a chatbot, and no
LLM is used in this flow.

## 1. Design authority and scope

- The feature follows the four supplied UML diagrams in `docs/uml/`:
  - **Class:** FinancialProfile, RiskAssessment, Recommendation
  - **Use case:** Assess Financial Risk «include» Preprocess / Generate Prediction / Store
  - **Activity:** validate → predict → store → recommend, with two error branches
  - **Sequence:** Web → Financial API Service → Financial Data Service / ML Prediction Service
- **Additive only.** Existing pages, services, tables and data are unchanged. Architecture:
  `docs/architecture-diagram-ml.png`. Message flow: `docs/service-communication-diagram-ml.png`.

## 2. Data

- **Dataset:** `personal_finance_zar.csv`, 32,424 records × 24 columns. It is synthetic, localised to ZAR at
  1 USD = 16.27 ZAR. Checksums are in `ml-service/data/README.md`.
- **Data audit** (`ml/data_audit.py` → `ml-service/reports/data_audit.md`): **31/31 checks pass**, covering
  shape, columns, missing values (0), duplicates (0), types, ranges, categories, ZAR = USD × 16.27, loan
  consistency, and both ratio definitions. **No record is altered, removed or imputed.** Large values are
  kept (§12).
- **Verified definitions**, which the data dictionary does not state precisely:
  - `debt_to_income_ratio` = EMI ÷ monthly income
  - `savings_to_income_ratio` = savings ÷ **annual** income, clipped to 0.1–10
- **Key observation:** the columns were generated independently at random. The largest absolute
  correlation between credit score and any other field is 0.012, and median income is about R65,000 for every
  employment status. Demographic fields therefore carry no real signal.

## 3. Target variable (the central issue)

The dataset has **no genuine Low/Medium/High label** (§17). The target is therefore **constructed and
documented** (§18 Option B) in `docs/risk_tier_methodology.md` and `ml/target.py`:

- **Indicators:** five, each scored 0 (healthy), 1 (watch) or 2 (stressed), using standard financial rules
  of thumb:
  - repayment burden
  - monthly surplus
  - expense ratio
  - credit score
  - savings coverage
- **Tiers:** the total (0–10) gives **Low 0–2 · Medium 3–5 · High 6–10**.
- **Distribution:** Low 43.94%, Medium 35.39%, High 20.67%. The handoff rubric had produced only 0.54% High.

**Circularity disclosure (§20).** The model is given the same values the target was calculated from, so it
learns to **reproduce the rubric**. FinAware does not claim that the model discovered financial risk
independently. The ablation in §6 measures this dependence.

## 4. Features and preprocessing

| Stage | Detail |
|---|---|
| Inputs (Decision D-2) | Only data FinAware holds (FinancialProfile, Debt, Users): income, expenses, savings, credit score, has loan, total debt, monthly repayment, interest rate, age, employment status |
| Recomputed server-side | `debt_to_income_ratio`, `savings_to_income_ratio` — the dataset's own definitions; client-supplied values are ignored |
| Engineered (§13) | disposable income, expense-to-income, monthly surplus after repayment, savings coverage (months), loan-to-income. `emi_to_income_ratio` is omitted because it duplicates DTI (§13.3) |
| Excluded (§6, §16) | user_id, record_date, all USD columns, gender, education, job title, loan term, loan type |
| Division by zero (§14) | Income ≤ 0 is rejected. Expenses = 0 → savings coverage is capped at 600 months (no dataset record reaches the cap). No Infinity or NaN reaches the model |
| Pipeline (§8) | One sklearn `Pipeline`: feature engineering → `StandardScaler` + `OneHotEncoder(handle_unknown="ignore")` → model. There are no imputers: a missing input is rejected, never filled |
| Leakage control | Stratified 80/20 split (`random_state=42`) — 25,939 train / 6,485 test. Everything is fitted inside the Pipeline on the training split only; cross-validation re-fits it on each fold |

## 5. Models, evaluation and selection (§21–23)

Four models were tuned by 5-fold stratified cross-validation (macro F1) on the training split, then evaluated
once on the held-out test set. SVM probabilities come from `CalibratedClassifierCV(SVC)`; the deprecated
`probability=True` is not used.

| Model | Accuracy | Macro F1 | Weighted F1 | High recall | Log loss | CV macro F1 |
|---|---|---|---|---|---|---|
| Random Forest | 0.995 | 0.995 | 0.995 | 0.994 | 0.049 | 0.994 |
| **Gradient Boosting** | **0.997** | **0.997** | **0.997** | **0.996** | **0.009** | **0.998** |
| K-Nearest Neighbours | 0.909 | 0.904 | 0.909 | 0.915 | 0.263 | 0.898 |
| Support Vector Machine | 0.935 | 0.933 | 0.935 | 0.952 | 0.189 | 0.924 |

Per-class metrics, confusion matrices, the hyper-parameter grids and permutation importance are in
`ml-service/reports/model_comparison.md`.

**Selection rule, fixed before training:** rank by macro F1. Among the models within 0.01 of the best,
prefer a tree model, because it can be explained exactly per user; then prefer higher High-risk recall, then
lower log loss. **Gradient Boosting** was selected. Random Forest was equally explainable but had lower High
recall and worse log loss. KNN and SVM were more than 0.01 behind the best.

## 6. What the scores mean

- **Ablation:** the same four models were trained **without** the rubric's inputs, leaving only age,
  employment status, has loan, loan amount and interest rate. Macro F1 fell to **0.52–0.55**, driven by
  "has a loan". The near-perfect main scores therefore come from reproducing the rubric.
- **Permutation importance** agrees: monthly repayment, expenses, income and credit score dominate, while
  age and employment status score exactly 0 for the tree models.
- **Calibration:** probabilities are very confident (mean top-class probability 0.996) because the target is
  a deterministic rule. The UI therefore says "predicted probability", never "guarantee" (§24).
- **Distribution shift, the most important limitation for real users:** almost no training record has low
  savings (minimum R10,347). With realistic savings (0–6 months of expenses), agreement with the rubric falls
  from 99.7% to **91.1%**, and the errors **under-estimate** risk. FinAware stores and displays a warning
  whenever an input is outside the training range. No synthetic records were added to "fix" this, because
  doing so would mean inventing data.

## 7. Prediction output (§24–25, §35)

- **Probabilities:** `{Low, Medium, High}` are mapped **by class name**, never by column position. sklearn
  orders classes alphabetically; a test proves the mapping.
- **Risk level:** the most probable class. The response is rejected if the probabilities do not sum to about
  1, or if the level is not the most probable class.
- **riskScore** (Decision D-3) = 100 × (0.5·P(Medium) + 1.0·P(High)). The UI shows whole-number
  percentages that always total 100.
- **Versions:** model name and version, target version and status, rules version, and an input snapshot are
  stored with every assessment (§46–47).

## 8. Explainability (§26–29)

- **Method:** SHAP on the selected tree model, per user.
  - Direction is measured the same way for every prediction, as the contribution towards **High versus Low**.
    Positive means "pushes risk up compared with a typical profile".
  - One-hot columns are summed back to their source field.
  - Importance is each factor's share of this user's total contribution. Bands: ≥ 25% Significant, ≥ 10%
    Moderate, otherwise Minor.
- **Implementation note:** SHAP's `TreeExplainer` supports only binary `GradientBoostingClassifier`. FinAware
  therefore passes SHAP an exact per-class tree ensemble, built from the fitted trees and scaled by the
  learning rate. Additivity was verified: the SHAP values plus the base value reproduce the model's raw
  scores.
- **Global view:** permutation importance for all four models, which is model-agnostic (§27).
- **Wording:** the UI says "Factors influencing this prediction… not what caused your situation" (§28). Only
  plain-language names are shown (§29).

## 9. Recommendations (§30–33, §48)

- **Engine:** deterministic rules in the **Financial API Service**, as drawn in the sequence diagram. The rules
  are stored as versioned data (`rules_version` 1.0, in `services/financial-api/src/recommendation-rules.ts`).
- **Rule types:**
  - **Condition rules:** the user's figures, e.g. a negative surplus → Critical.
  - **Driver rules:** fire only when a factor *increases* risk with at least Moderate influence.
  - **Tier rules:** one set each for Low, Medium and High.
- **Output:** one recommendation per topic, up to 5, sorted by priority.
- **Traceability:** each recommendation stores its rule ID, tier, driver and user value, which gives
  risk tier + model driver + user condition (§33).
- **No LLM:** OpenAI is not used in this flow. The existing Rehab page keeps its own feature unchanged.

## 10. Integration, errors and security (§34–44)

- **Flow:** Next.js route (session check) → Financial API (Zod validation, field-level errors) → Financial Data
  (the only DB access; existing tables read-only) and ML Prediction Service (FastAPI, port 8000).
- **Structured errors:**
  - `INVALID_INPUT` 422
  - `MODEL_UNAVAILABLE` 503
  - `PREDICTION_FAILED` 500
  - Warnings: `UNKNOWN_CATEGORY`, `OUTSIDE_TRAINING_RANGE`
- **On prediction failure,** nothing is stored and the page offers **Retry**. This is the activity diagram's
  "No" branch, verified in the browser.
- **Internal services:** the ML service runs only inside the cluster, as a non-root container with the model
  baked into the image. A NetworkPolicy allows only the Financial API to call it, and `/model-info` returns
  metadata only.
- **Database:** a create-only migration adding 4 tables (`docs/ml/prisma_migration_ml_risk.sql`).

## 11. Testing (§45)

- **Python (32 tests):** data, feature (hand-calculated examples), model (probabilities, class mapping,
  drivers) and API (valid, invalid, missing, wrong type, malformed, unknown category, model unavailable).
- **Node (13 tests):** validation, recommendation rules (deterministic, traceable) and orchestration order,
  including ML-down and invalid-probability branches.
- **End to end:** browser walk-through of both activity-diagram branches, plus a check that the existing pages
  still load.
- **CI** runs all of these (`.github/workflows/ci.yml`).

## 12. Limitations

1. **Synthetic data.** The dataset is synthetic, with independently random columns; results do not describe
   real people.
2. **Constructed target.** The target is constructed, so the model reproduces a rubric rather than predicting
   real outcomes such as default.
3. **Low savings.** The model is less reliable for low-savings profiles, which are common among real users
   (§6). This is shown to users as a warning.
4. **Estimated repayments.** FinAware debts have no repayment field, so repayments use the dashboard's
   per-debt estimate (Decision D-4, `docs/ml/feature_mapping.md`).
5. **Importance is not causation.** Probabilities are near-certain because the target is deterministic.
6. **SQLite.** SQLite is kept, where the diagram shows PostgreSQL (D-1), with single replicas for the
   prototype.

If a genuinely labelled dataset becomes available (Option A), it should replace the constructed target, and
the same pipeline, evaluation and reports can be re-run unchanged.
