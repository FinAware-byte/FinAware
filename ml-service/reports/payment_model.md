# Missed-payment model — results

Generated 2026-09-23T12:31:35+00:00. Model version 1.0.

## The task

Given what is known about a user *before* a payment falls due, estimate the probability
that this payment is missed. The label is `Payment_History.missed`, a recorded outcome.
Nothing computes it from the features, so this model cannot reproduce a rubric the way
the `risk_tier` model does.

- Training rows: 1280 (miss rate 0.1359)
- Holdout rows: 418 (miss rate 0.1148)
- The holdout is the most recent slice of due dates, never a random sample.

## Results on the holdout

| Model | Avg precision | ROC AUC | Brier | Threshold | Precision | Recall | F1 |
|---|---|---|---|---|---|---|---|
| Baseline: always the base rate | 0.1148 | 0.5 | 0.1021 | 0.14 | 0.1148 | 1.0 | 0.206 |
| Baseline: the user's past miss rate | 0.1853 | 0.6209 | 0.102 | 0.22 | 0.1967 | 0.25 | 0.2202 |
| Logistic Regression | 0.1971 | 0.7044 | 0.2355 | 0.6 | 0.23 | 0.4792 | 0.3108 |
| Random Forest | 0.2139 | 0.6956 | 0.2095 | 0.55 | 0.234 | 0.4583 | 0.3099 |
| Gradient Boosting **(selected)** | 0.2045 | 0.6986 | 0.1007 | 0.18 | 0.2165 | 0.4375 | 0.2897 |

Selection rule, fixed before training: average_precision, then Brier score, then simplicity.

## Does the model earn its place?

The selected model beats the past-miss-rate heuristic, so the learning adds something.

## Confusion matrix at the chosen threshold (0.18)

| | predicted paid | predicted missed |
|---|---|---|
| actually paid | 294 | 76 |
| actually missed | 27 | 21 |

## Hyper-parameters chosen

- **Logistic Regression**: `{'model__C': 0.25}`
- **Random Forest**: `{'model__max_depth': 3, 'model__min_samples_leaf': 15, 'model__n_estimators': 200}`
- **Gradient Boosting**: `{'model__learning_rate': 0.03, 'model__max_depth': 2, 'model__n_estimators': 100}`

## Limitations

1. The payment history is seeded demo data. The seed draws each user's number of missed
   payments from their demo risk band and weights misses towards Garnished debts, so the
   learnable signal is propensity and debt status, not timing.
2. Which payments are missed is uniform in time, so streaks and recency carry little
   information. Do not read the model as having found a temporal pattern.
3. The panel is small and the positive class is rare, so holdout metrics move noticeably
   with the split.
4. Debt balances are a current snapshot, not historised, so balance features are
   approximate at older due dates.
