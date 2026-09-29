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
- **CI** (`.github/workflows/ci.yml`) runs all of these, but its automatic runs are paused for now, so run
  them locally: `npm test` and `npm run ml:test`.

## 11b. Second model: missed payments (a recorded outcome)

The `risk_tier` model reproduces a rubric (§3). This second model exists to answer the obvious
challenge — *does any of this need machine learning?* — with a task that has a **real label**.

- **Task.** Given what is known before a payment falls due, estimate the probability it is missed.
- **Label.** `Payment_History.missed`, an outcome already recorded in FinAware. No feature
  computes it, so the circularity criticism does not apply here.
- **Features (none of them rubric inputs).** Past miss rate, miss rate over the last six payments,
  current miss streak, months since the last miss, payments on record, number of active debts,
  this debt's interest rate and balance-to-income, total balance-to-income, and debt status.
  The seeded `risk_level` is deliberately excluded: it is the demo label the app displays, and
  using it would let the model read the answer.
- **Panel.** Every feature at a due date is computed from payments strictly earlier than it
  (`ml/payment/dataset.py`), and the holdout is the **latest slice of due dates**, never a random
  sample — the question is about the future.
- **Signal check, run before building anything.** Base miss rate 13.1%; by debt status Active 6.9%
  → Re-considered 16.7% → Garnished 28.7%; past miss rate alone reaches AUC 0.608. The signal is
  real, so the model was worth building.

### Results (holdout = the most recent 30% of due dates, 418 rows)

| Model | Avg precision | ROC AUC | Brier | Precision | Recall |
|---|---|---|---|---|---|
| Baseline: always the base rate | 0.115 | 0.500 | 0.102 | 0.115 | 1.000 |
| Baseline: the user's past miss rate | 0.185 | 0.621 | 0.102 | 0.197 | 0.250 |
| Logistic Regression | 0.197 | 0.704 | 0.236 | 0.230 | 0.479 |
| Random Forest | 0.214 | 0.696 | 0.210 | 0.234 | 0.458 |
| **Gradient Boosting (selected)** | **0.205** | **0.699** | **0.101** | 0.217 | 0.438 |

Selection rule, fixed before training: average precision, then Brier score, then simplicity.
Gradient Boosting was chosen over Random Forest's marginally higher average precision because its
Brier score is half as large, and the interface shows the probability itself.

**The decision threshold is 0.18, not 0.5.** With a 13% base rate a well-calibrated model rarely
crosses 0.5 and would flag nobody. The threshold is chosen on out-of-fold training predictions and
only then applied to the holdout.

**Honest reading of the numbers.** AUC 0.70 means the model ranks a missed payment above a paid one
about seven times in ten. It beats the past-miss-rate heuristic (0.205 vs 0.185), so the learning
adds something — but it is a nudge to check your dates, not a forecast, and the interface says so.

### What it does not show

The seed draws each user's *number* of missed payments from their demo risk band and weights misses
towards Garnished debts, but spreads them uniformly in time. Propensity and debt status are
therefore learnable; **timing is not**. The weak streak and recency effects in the data are
consistent with that, and the model must not be presented as having found a temporal pattern.

### Serving

One probability per outstanding debt (including Garnished and Re-considered ones — those have the
most payments at risk), plus a user-level "chance of missing at least one", which assumes the debts
fail independently. They do not, so the per-debt figures stay visible beneath the headline number.
Explanations use SHAP directly: a binary `GradientBoostingClassifier` needs none of the per-class
reconstruction §8 describes. The endpoint is `POST /predict/payment-miss`, reached through
`GET /payment-outlook/:userId` on the Financial API; the feature computation lives in the Financial
Data Service, so the ML service still never touches the database.

The artefact is optional at runtime: an image built without `payment_pipeline.joblib` still serves
the risk tier and reports ready, and only this endpoint returns `MODEL_UNAVAILABLE`.

## 11c. Credit score: calculated, not entered

Until this change `credit_score` was a stored number with two ways in: a user could type it into
the Identity form, and for seeded users it came from `randomInt()` inside a band chosen from the
ID number. It was not a consequence of anything the user did, yet it was a model input and one of
the indicators behind the constructed `risk_tier` target. A user could raise their own score and
receive a better risk tier.

It is now calculated by `lib/finance/credit-score.ts` from recorded facts only:

| Factor | Weight | Source |
|---|---|---|
| Payment history | 35% | missed vs total rows in `Payment_History` |
| Amounts owed | 30% | monthly repayments against `Users.monthly_income` |
| Length of history | 15% | count of payment rows (proxy for account age) |
| Account mix | 10% | distinct `Debts.debt_type` values |
| Judgments and orders | 10% | `Legal_Records`, `GARNISHED` / `RECONSIDERED` status |

Output is 300–850, the range the model was trained on. The stored `Credit_Profile.credit_score` is
a cache of this calculation, refreshed by `refreshCreditProfileTotals()` whenever a debt changes or
income is updated. No request body can set it: it was removed from `financialProfileSchema`, from
`identityUpdateSchema`, and from `simulationOverridesSchema`.

**This is a model of a credit score, not a bureau score.** It excludes enquiry counts, true account
ages in months and bureau-specific adjustments, because the application does not record them.

### Effect on the risk model — read before retraining

In the training data (`personal_finance_zar.csv`, 32 424 rows) `credit_score` is effectively
uniform on 300–850 and has almost no relationship to the financial variables:

| Pair | Correlation |
|---|---|
| credit_score vs debt_to_income_ratio | +0.012 |
| credit_score vs savings_to_income_ratio | +0.002 |
| credit_score vs monthly_emi_zar | +0.001 |
| credit_score vs loan_amount_zar | +0.007 |

In other words the column the model trained on carries no signal about the rest of the row. The
calculated score does — by construction it is a function of repayments, income and payment history.
That is a **distribution shift in an input feature**: the value stays inside the trained range, but
its relationship to the other features is new.

Measured over the 54 seeded users, the calculated scores sit within the trained range and close to
its centre (median 623 against 575; spread 421–808 against 300–850), so predictions remain
in-distribution. It is still a change the model has not seen, and the correct resolution is to
retrain once the `risk_tier` target is approved — noting that `credit_score` is itself one of the
indicators used to construct that target, so the two decisions are linked and should be made
together.

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
