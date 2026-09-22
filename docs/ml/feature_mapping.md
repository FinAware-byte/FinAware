# FinAware → ML feature mapping

How the Financial Data Service turns a FinAware user's records into the ML Prediction Service input
(`lib/microservices/financial-data-service.ts` → `getFinancialData`). Existing tables are read only.

| ML input (dataset column) | FinAware source | Rule |
|---|---|---|
| `monthly_income_zar` | `Financial_Profile.monthly_income` | Entered on the Financial Profile page; must be > 0 |
| `monthly_expenses_zar` | `Financial_Profile.monthly_expenses` | Living costs, excluding debt repayments |
| `savings_zar` | `Financial_Profile.savings` | |
| `credit_score` | `Financial_Profile.credit_score` | 300–850 (the model's training range); prefilled from `Credit_Profile.credit_score`, clamped |
| `has_loan` | `Debts` | `"Yes"` if the user has at least one ACTIVE debt with a balance > 0 |
| `loan_amount_zar` | `Debts.balance` | Sum of ACTIVE debt balances |
| `monthly_emi_zar` | `Debts.balance`, `Debts.interest_rate` | **Decision D-4 (revised):** sum of `estimateMonthlyObligation(balance, rate)` over ACTIVE debts — exactly the "Monthly Obligations" figure on the dashboard |
| `loan_interest_rate_pct` | `Debts.interest_rate` | Balance-weighted average over ACTIVE debts; 0 with no debt |
| `age` | `Users.real_age` | |
| `employment_status` | `Users.employment_status` | Casing normalised (`EMPLOYED`/`Employed` → `Employed`, `SELF_EMPLOYED`/`Self-Employed` → `Self-employed`, …). Unrecognised values (e.g. `Pensioner`) are passed unchanged so the ML service flags `UNKNOWN_CATEGORY` rather than silently replacing them |

"ACTIVE" is decided with the existing `toDebtStatus()` helper, because seeded rows store `Active` while
app-created rows store `ACTIVE`.

Calculated inside the ML service from the inputs above (client-supplied values are ignored):
`debt_to_income_ratio`, `savings_to_income_ratio`, `disposable_income_zar`, `expense_to_income_ratio`,
`monthly_surplus_after_emi_zar`, `savings_coverage_months`, `loan_to_income_ratio` — formulas in
`ml-service/artifacts/feature_schema.json` and `ml-service/ml/features.py`.

## Why D-4 changed

The plan recommended `Credit_Profile.monthly_obligations`. During end-to-end testing, a seeded user had
`Credit_Profile.monthly_obligations = R7,623.51`, while the dashboard showed **R1,264.78** for the same
debts. The stored column is not kept in step for seeded users, so the model now uses the same per-debt
calculation the dashboard displays. The user sees one consistent repayment figure everywhere.

## Differences from the training data (disclosed)

| Topic | Training dataset | FinAware users |
|---|---|---|
| Loan types | Business, Car, Education, Home | Mortgage, vehicle, credit/store cards, personal loans, … — not used as a model input (D-2) |
| Loan term | Present | Not stored — not used (D-2) |
| Savings | Minimum R10,347; median covers 101 months of expenses | Often far lower — see the reliability note below |
| Credit score | 300–850 | Existing records allow up to 900; the profile form limits to 850 |

**Reliability note.** With realistic savings (0–6 months of expenses), the model agrees with the rubric for
91.1% of profiles, compared with 99.7% on data like its training set. Its mistakes under-estimate risk. Every
input outside the training range is returned as a warning, stored with the assessment and shown to the user.
