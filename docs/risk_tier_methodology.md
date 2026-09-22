# FinAware — Risk Tier Target Methodology

| Item | Value |
|---|---|
| Target name | `risk_tier` (Low / Medium / High) |
| risk_target_version | **1.0** |
| Status | **PROPOSED — awaiting supervisor approval. Do not train final models on this target until approved.** |
| Approach | Specification §18 **Option B** — documented, constructed (synthetic) target |
| Code | `ml-service/ml/target.py` (`RUBRIC`, `TIER_CUTS`) |
| Dataset | `personal_finance_zar.csv`, 32,424 records (SHA-256 `aa0aeae9…1bce53`) |
| Date | 21 September 2026 |

All figures below were produced by running `ml/target.py` on the full dataset. None are estimated.

## 1. Why a constructed target is needed

The supplied dataset contains **no genuine Low / Medium / High risk label** (specification §17).
No labelled dataset (Option A) has been supplied. The prototype therefore uses a deterministic,
documented financial-health rubric to create the training target (Option B).

The target is **constructed, not observed**. FinAware must never claim that the model
"discovered financial risk independently from the data" (§20).

### Why the handoff package's rubric was not used

The developer handoff rubric (weighted 0–100 score, weights 35/25/20/20) was run on the real data:

| Tier | Records | % |
|---|---|---|
| Low | 21,707 | 66.95 |
| Medium | 10,543 | 32.52 |
| High | **174** | **0.54** |

The High class is too small to train or evaluate reliably. Its savings component also almost never
fires, because the handoff code overwrote `savings_to_income_ratio` with savings ÷ *monthly* income
(median ≈ 60). The dataset's own field uses *annual* income, clipped to 0.1–10.

## 2. The proposed rubric (version 1.0)

Five independent financial indicators each score **0 (healthy)**, **1 (watch)** or **2 (stressed)**.
The points are added to a total of **0–10**.

| # | Indicator | Formula (dataset columns) | 0 points | 1 point | 2 points | Basis for the thresholds |
|---|---|---|---|---|---|---|
| 1 | Repayment burden | `monthly_emi_zar ÷ monthly_income_zar` (equals the dataset's `debt_to_income_ratio`) | < 0.20 | 0.20 – 0.40 | > 0.40 | Common lending affordability guidance: repayments above ~40% of income are high-stress |
| 2 | Monthly surplus share | `(income − expenses − EMI) ÷ income` | ≥ 0.20 | 0 – 0.20 | < 0 (negative) | The 20% savings share of the 50/30/20 budgeting rule; a negative value means commitments exceed income |
| 3 | Expense ratio | `monthly_expenses_zar ÷ monthly_income_zar` | < 0.60 | 0.60 – 0.85 | > 0.85 | Spending above ~85% of income leaves little buffer |
| 4 | Credit score | `credit_score` (300–850) | ≥ 670 | 580 – 669 | < 580 | Standard 300–850 score bands: 580 starts "fair", 670 starts "good" |
| 5 | Savings coverage | `savings_zar ÷ monthly_expenses_zar` (months) | ≥ 6 | 3 – 6 | < 3 | Common emergency-fund guidance of 3–6 months of expenses |

**Tier cut-points on total points:** **Low 0–2 · Medium 3–5 · High 6–10**

Interpretation: *Low* means stress in at most one area. *Medium* means stress in two areas, or watch
signals in several. *High* means stress across three or more areas.

The thresholds are **standard financial guidance, not values tuned to this dataset**. Only the tier
cut-points were chosen by looking at the resulting distribution, so that every tier holds a usable
share of records (target ≥ ~15%).

### Division-by-zero handling

- **Income ≤ 0:** rejected. Every dataset record has income > 0 (minimum R8,135). New users are
  validated at the API.
- **Expenses = 0:** savings coverage is treated as unlimited, which scores 0 points. No dataset record
  has zero expenses (minimum R2,441).
- No Infinity or NaN values reach the total.

## 3. Resulting class distribution

| Tier | Records | % |
|---|---|---|
| **Low** | 14,246 | 43.94 |
| **Medium** | 11,476 | 35.39 |
| **High** | 6,702 | 20.67 |
| Total | 32,424 | 100.00 |

### Distribution of total points

| Points | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Records | 3,379 | 3,807 | 7,060 | 4,657 | 3,343 | 3,476 | 3,650 | 2,505 | 506 | 32 | 9 |

### How often each indicator fires

| Indicator | 0 pts | 1 pt | 2 pts |
|---|---|---|---|
| Repayment burden | 63.5% | 3.5% | 33.0% |
| Surplus share | 53.3% | 13.6% | 33.1% |
| Expense ratio | 49.7% | 41.8% | 8.5% |
| Credit score | 32.8% | 16.4% | 50.7% |
| Savings coverage | 97.9% | 1.6% | 0.5% |

### Median indicator values per tier

| Tier | Repayment burden | Surplus share | Expense ratio | Credit score | Savings coverage (months) |
|---|---|---|---|---|---|
| Low | 0.000 | 0.486 | 0.503 | 644 | 116.8 |
| Medium | 0.000 | 0.130 | 0.699 | 574 | 89.0 |
| High | 1.719 | −1.372 | 0.670 | 472 | 92.9 |

### Sensitivity to the cut-points (shown for transparency; not adopted)

| Low / Medium boundary | Medium / High boundary | Low % | Medium % | High % |
|---|---|---|---|---|
| ≤ 1 | ≤ 4 | 22.2 | 46.4 | 31.4 |
| ≤ 2 | ≤ 4 | 43.9 | 24.7 | 31.4 |
| **≤ 2** | **≤ 5** | **43.9** | **35.4** | **20.7** ← proposed |
| ≤ 3 | ≤ 5 | 58.3 | 21.0 | 20.7 |
| ≤ 2 | ≤ 6 | 43.9 | 46.7 | 9.4 |

## 4. Known properties of this target (must be disclosed)

1. **Loans dominate the High tier.** Repayment burden and surplus share both depend on the monthly
   loan repayment. In the dataset, 60% of borrowers pay more in EMI than they earn. As a result:

   | has_loan | Low | Medium | High |
   |---|---|---|---|
   | No (19,429) | 68.2% | 31.6% | 0.2% |
   | Yes (12,995) | 7.7% | 41.0% | 51.3% |

   Non-borrowers can still reach Medium, through expense ratio and credit score, and at most
   7 points. This reflects the synthetic data rather than a design choice.
2. **Savings coverage rarely fires.** Median savings cover 101 months of expenses, so only 2.1% of
   records score any points on this indicator. It is kept because savings resilience is a required
   indicator (§19), and real FinAware users may have much lower savings than the synthetic records.
3. **Demographics carry no signal.** The dataset's columns were generated independently at random.
   The tier split is almost identical across employment statuses: High is 20.5% for Employed and
   21.4% for Unemployed.
4. **Indicators overlap.** Surplus share includes both expenses and EMI, so it partly overlaps the
   repayment-burden and expense-ratio indicators. This is accepted for readability. The effect is
   that a heavy loan repayment weighs more than a high expense ratio.
5. **The model is least reliable where real users differ most from the data.** The synthetic records
   almost never have low savings (minimum R10,347; only 0.5% score 2 points on savings coverage). In a
   provisional run, the trained model agreed with this rubric for 99.7% of held-out records, but for only
   91.1% of the same records when savings were set to realistic levels (0–6 months of expenses), and its
   errors under-estimated risk (e.g. 275 of 1,783 High profiles predicted Medium). FinAware therefore
   stores and displays a reliability warning whenever an input is outside the training range. Synthetic
   low-savings records were **not** added to the training data, because that would be inventing data; if
   the supervisor wants this addressed, it needs an agreed, documented method.

## 5. Circularity / target leakage disclosure (specification §20)

The target is calculated from income, expenses, EMI, savings and credit score. The model will be
given those same values (and ratios derived from them) as inputs. **The model will therefore learn to
reproduce this rubric, and its near-perfect accuracy will reflect that.** This is acceptable for an
academic prototype, provided it is stated plainly:

> *FinAware uses a constructed classification target (risk_target_version 1.0) derived from a
> documented financial-health rubric. The machine-learning models are evaluated on how well they
> reproduce this classification from a user's financial profile. The models did not discover
> financial risk independently from the data.*

To make the dependence visible, Step 3 also trains **ablation models** without the rubric's source
columns (income, expenses, EMI, savings, credit score and DTI). They are reported alongside the main
models to show how much the remaining fields predict on their own (Decision D-6).

If a genuine labelled dataset becomes available (Option A), it replaces this target.

## 6. Model feature set (Decision D-2 — proposed)

Following the class, activity and sequence diagrams, the model uses only data that FinAware holds in
`FinancialProfile` and `Debt`, plus age and employment status already stored on `Users`.

| Used as model inputs | Excluded |
|---|---|
| monthly_income_zar, monthly_expenses_zar, savings_zar, credit_score, has_loan, loan_amount_zar, monthly_emi_zar, loan_interest_rate_pct, debt_to_income_ratio, savings_to_income_ratio, age, employment_status | user_id, record_date (identifier and date, §6/§16) |
| Engineered: disposable_income_zar, expense_to_income_ratio, monthly_surplus_after_emi_zar, savings_coverage_months, loan_to_income_ratio | All `*_usd` columns (duplicate the ZAR columns, §16) |
| | gender, education_level, job_title, loan_term_months, loan_type (not held in the diagrams' data model; no signal in the data; the dictionary flags gender as needing an appropriateness review) |
| | risk_points, risk_tier and the per-indicator points (target fields) |

## 7. Supervisor approval

Please confirm or amend each item.

| # | Item | Proposed | Approved? / changes |
|---|---|---|---|
| D-0 | Approach | Option B — constructed target, version 1.0 | |
| D-0a | Indicators and thresholds | Table in section 2 | |
| D-0b | Tier cut-points | Low 0–2, Medium 3–5, High 6–10 | |
| D-1 | Database | Keep SQLite; the diagrams' PostgreSQL is the documented production target | |
| D-2 | Model features | Section 6 | |
| D-3 | riskScore | 100 × (0.5 × P(Medium) + 1.0 × P(High)); riskLevel = highest probability | |
| D-4 | Monthly debt repayment source | **Revised:** the dashboard's per-debt estimate summed over active debts (the stored `Credit_Profile.monthly_obligations` is stale for seeded users — see `docs/ml/feature_mapping.md`) | |
| D-5 | Legacy risk badge | Kept; new result labelled "ML Financial Risk Assessment" | |
| D-6 | Ablation models | Yes | |

Approved by: ______________________  Date: ____________

After approval, set `RISK_TARGET_STATUS = "approved"` in `ml-service/ml/target.py` and change the
status line at the top of this document.
