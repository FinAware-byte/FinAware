import assert from "node:assert/strict";
import { test } from "node:test";
import type { MlPrediction, RiskDriver } from "../../lib/risk/types";
import { generateRecommendations } from "../../services/financial-api/src/recommendations";
import { RULES_VERSION } from "../../services/financial-api/src/recommendation-rules";

const indicators = {
  debtToIncomeRatio: 0.62,
  expenseToIncomeRatio: 0.73,
  savingsToIncomeRatio: 0.1,
  savingsCoverageMonths: 0.56,
  disposableIncome: 3372,
  monthlySurplusAfterEmi: -4252,
  loanToIncomeRatio: 0.15
};
const driver = (feature: string, label: string, influence: RiskDriver["influence"], direction: RiskDriver["direction"], value: number): RiskDriver => ({
  feature, label, importance: 0.2, influence, direction, value
});

const highRisk: Pick<MlPrediction, "riskLevel" | "topDrivers" | "indicators"> = {
  riskLevel: "High",
  indicators,
  topDrivers: [
    driver("savings_coverage_months", "Savings coverage", "Significant", "increases_risk", 0.56),
    driver("debt_to_income_ratio", "Debt-to-income ratio", "Moderate", "increases_risk", 0.62),
    driver("credit_score", "Credit score", "Moderate", "increases_risk", 560)
  ]
};

test("high-risk profile: critical cash-flow first, capped at 5, all traceable and versioned", () => {
  const recs = generateRecommendations({ prediction: highRisk, creditScore: 560 });
  assert.equal(recs.length, 5);
  assert.equal(recs[0].ruleId, "COND_NEGATIVE_SURPLUS");
  assert.equal(recs[0].priority, "Critical");
  assert.match(recs[0].reason, /R\s?4\s?252/);
  for (const rec of recs) {
    assert.equal(rec.rulesVersion, RULES_VERSION);
    assert.ok(rec.trace.length > 0);
    assert.ok(rec.trace.every((t) => t.tier === "High"));
  }
  const debt = recs.find((r) => r.type === "debt");
  assert.ok(debt, "debt recommendation expected");
  assert.deepEqual(
    debt.trace.map((t) => t.ruleId).sort(),
    ["COND_HIGH_REPAYMENT_BURDEN", "DRV_DEBT"],
    "condition and driver rule merged into one recommendation with both traces"
  );
  assert.equal(new Set(recs.map((r) => r.type)).size, recs.length, "one recommendation per topic");
});

test("deterministic: same input gives identical output", () => {
  const a = generateRecommendations({ prediction: highRisk, creditScore: 560 });
  const b = generateRecommendations({ prediction: highRisk, creditScore: 560 });
  assert.deepEqual(a, b);
});

test("low-risk profile: drivers that decrease risk do not trigger problem rules", () => {
  const recs = generateRecommendations({
    creditScore: 760,
    prediction: {
      riskLevel: "Low",
      indicators: { ...indicators, debtToIncomeRatio: 0, expenseToIncomeRatio: 0.4, savingsCoverageMonths: 20, monthlySurplusAfterEmi: 25000 },
      topDrivers: [
        driver("credit_score", "Credit score", "Significant", "decreases_risk", 760),
        driver("expense_to_income_ratio", "Expense-to-income ratio", "Moderate", "decreases_risk", 0.4)
      ]
    }
  });
  assert.deepEqual(recs.map((r) => r.ruleId), ["TIER_LOW_MAINTAIN"]);
});

test("minor drivers are ignored; moderate risk-increasing driver fires at Medium priority", () => {
  const recs = generateRecommendations({
    creditScore: 700,
    prediction: {
      riskLevel: "Medium",
      indicators: { ...indicators, debtToIncomeRatio: 0.26, monthlySurplusAfterEmi: 5000, savingsCoverageMonths: 12 },
      topDrivers: [
        driver("debt_to_income_ratio", "Debt-to-income ratio", "Moderate", "increases_risk", 0.26),
        driver("savings_zar", "Savings", "Minor", "increases_risk", 1000)
      ]
    }
  });
  assert.deepEqual(recs.map((r) => [r.ruleId, r.priority]), [
    ["DRV_DEBT", "Medium"],
    ["TIER_MEDIUM_RESILIENCE", "Medium"]
  ]);
});
