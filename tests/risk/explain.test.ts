import assert from "node:assert/strict";
import { test } from "node:test";
import { explainRecommendation, workingFor } from "../../lib/risk/explain";
import { RULES } from "../../lib/risk/recommendation-rules";
import type { MlFeaturePayload, RiskAssessmentRecord, RiskDriver, StoredRecommendation } from "../../lib/risk/types";
import { generateRecommendations } from "../../services/financial-api/src/recommendations";

const plain = (text: string) => text.replace(/ /g, " ");

// One consistent profile: every indicator below is what the model would derive from these inputs.
const inputs: MlFeaturePayload = {
  monthly_income_zar: 20000,
  monthly_expenses_zar: 14600,
  savings_zar: 8176,
  credit_score: 560,
  has_loan: "Yes",
  loan_amount_zar: 36000,
  monthly_emi_zar: 12400,
  loan_interest_rate_pct: 18.5,
  age: 34,
  employment_status: "Employed"
};

const indicators = {
  debtToIncomeRatio: 0.62,
  expenseToIncomeRatio: 0.73,
  savingsToIncomeRatio: 0.1,
  savingsCoverageMonths: 0.56,
  disposableIncome: 5400,
  monthlySurplusAfterEmi: -7000,
  loanToIncomeRatio: 0.15
};

const driver = (
  feature: string,
  label: string,
  importance: number,
  influence: RiskDriver["influence"],
  direction: RiskDriver["direction"],
  value: number | string
): RiskDriver => ({ feature, label, importance, influence, direction, value });

const assessment: Pick<RiskAssessmentRecord, "riskLevel" | "riskScore" | "probabilities" | "drivers" | "inputs"> = {
  riskLevel: "High",
  riskScore: 81.5,
  probabilities: { Low: 0.05, Medium: 0.27, High: 0.68 },
  inputs,
  drivers: [
    driver("savings_coverage_months", "Savings coverage", 0.34, "Significant", "increases_risk", 0.56),
    driver("debt_to_income_ratio", "Debt-to-income ratio", 0.22, "Moderate", "increases_risk", 0.62),
    driver("credit_score", "Credit score", 0.12, "Moderate", "increases_risk", 560),
    driver("age", "Age", 0.06, "Minor", "decreases_risk", 34),
    driver("employment_status", "Employment status", 0.04, "Minor", "decreases_risk", "Employed")
  ]
};

const stored = (overrides: Partial<StoredRecommendation>): StoredRecommendation => ({
  recommendationId: "r1",
  type: "debt",
  title: "Review your debt obligations",
  description: "…",
  reason: "…",
  priority: "High",
  rulesVersion: "1.0",
  trace: [],
  ...overrides
});

const debtRec = stored({
  trace: [
    { ruleId: "COND_HIGH_REPAYMENT_BURDEN", tier: "High", driver: "debt_to_income_ratio", indicator: "debtToIncomeRatio", userValue: 0.62 },
    { ruleId: "DRV_DEBT", tier: "High", driver: "debt_to_income_ratio", indicator: "debt_to_income_ratio", userValue: 0.62 }
  ]
});

test("a condition rule is explained with its real threshold and the user's value", () => {
  const why = explainRecommendation(debtRec, assessment);
  const condition = why.triggers.find((t) => t.ruleId === "COND_HIGH_REPAYMENT_BURDEN");

  // The threshold must come from the rule table the engine uses, not be restated here.
  const rule = RULES.find((r) => r.id === "COND_HIGH_REPAYMENT_BURDEN")!;
  const threshold = `${Math.round(rule.when!.value * 100)}%`;
  assert.ok(condition, "the condition rule should be explained");
  assert.match(condition.text, new RegExp(`more than ${threshold}`));
  assert.match(condition.text, /Yours is 62%/);
});

test("the arithmetic reproduces the figure the rule fired on", () => {
  // If the working and the stored indicator disagree, the explanation is explaining something else.
  const dti = workingFor("debt_to_income_ratio", inputs)!;
  assert.equal(dti.lines.at(-1)?.value, `${Math.round(indicators.debtToIncomeRatio * 100)}%`);
  assert.match(plain(dti.lines[0].value), /R 12 400,00/);
  assert.match(plain(dti.lines[1].value), /R 20 000,00/);

  const surplus = workingFor("monthly_surplus_after_emi_zar", inputs)!;
  assert.match(plain(surplus.lines.at(-1)!.value), /-R 7 000,00/);

  const coverage = workingFor("savings_coverage_months", inputs)!;
  assert.equal(coverage.lines.at(-1)?.value, `${indicators.savingsCoverageMonths.toFixed(1)} months`);
});

test("only the drivers the recommendation rests on are marked as linked", () => {
  const why = explainRecommendation(debtRec, assessment);
  const linked = why.drivers.filter((d) => d.linked).map((d) => d.feature);
  assert.deepEqual(linked, ["debt_to_income_ratio"]);
  assert.equal(why.drivers.length, assessment.drivers.length, "every driver is still shown, for context");
});

test("a merged recommendation explains each rule once, and the driver rule names what it watches", () => {
  const doubled = stored({ trace: [...debtRec.trace, debtRec.trace[1]] });
  const why = explainRecommendation(doubled, assessment);

  assert.equal(why.triggers.length, 2);
  const drv = why.triggers.find((t) => t.kind === "driver");
  assert.ok(drv?.watches?.includes("Debt-to-income ratio"));
  assert.match(drv!.text, /moderate influence, 22% of the model's reasoning/);
});

test("a tier recommendation shows how the risk score is built from the probabilities", () => {
  const tierRec = stored({
    type: "guidance",
    trace: [{ ruleId: "TIER_HIGH_GUIDANCE", tier: "High", driver: null, indicator: null, userValue: null }]
  });
  const why = explainRecommendation(tierRec, assessment);

  assert.equal(why.followsFromTier, true);
  assert.match(why.triggers[0].text, /68% on High/);
  const score = why.working.find((g) => g.title === "Risk score")!;
  const medium = Number(score.lines[1].value);
  const high = Number(score.lines[2].value);
  assert.ok(Math.abs(medium + high - assessment.riskScore) < 0.2, "the lines must add up to the score shown");
  assert.equal(why.drivers.some((d) => d.linked), false, "no single driver is claimed for a tier rule");
});

test("the risk score working adds up as printed, and says how the card rounds it", () => {
  const tierRec = stored({ trace: [{ ruleId: "TIER_LOW_MAINTAIN", tier: "Low", driver: null, indicator: null, userValue: null }] });
  const scoreFor = (probabilities: RiskAssessmentRecord["probabilities"], riskScore: number) =>
    explainRecommendation(tierRec, { ...assessment, riskLevel: "Low", riskScore, probabilities }).working.find(
      (g) => g.title === "Risk score"
    )!;

  // The live case: whole-percent lines printed "High 0% × 1 = 0.1", and one-decimal lines printed
  // 4.5 + 0.1 = 4.5. Each line must multiply out, and the answer must be the sum of the lines.
  for (const [probabilities, riskScore] of [
    [{ Low: 0.9096, Medium: 0.0898, High: 0.0006 }, 4.5],
    [{ Low: 0.908, Medium: 0.091, High: 0.001 }, 4.6],
    [{ Low: 0.05, Medium: 0.27, High: 0.68 }, 81.5]
  ] as const) {
    const score = scoreFor(probabilities, riskScore);
    for (const [index, weight] of [[1, 0.5], [2, 1]] as const) {
      const line = score.lines[index];
      const printedPercent = Number(/([\d.]+)%/.exec(line.label)![1]);
      assert.ok(Math.abs(printedPercent * weight - Number(line.value)) < 0.006, `"${line.label} = ${line.value}" does not multiply out`);
    }
    const sum = Number(score.lines[1].value) + Number(score.lines[2].value);
    assert.equal(score.lines.at(-1)?.value, sum.toFixed(2), "the answer is the sum of the lines as printed");
  }

  assert.match(scoreFor({ Low: 0.9096, Medium: 0.0898, High: 0.0006 }, 4.5).note ?? "", /Shown rounded as 5/);

  // Double rounding: 4.46 would round to 4, but the model stored 4.5 and the card shows 5.
  // The receipt must not leave that looking like an arithmetic error.
  const edge = scoreFor({ Low: 0.9108, Medium: 0.0892, High: 0 }, 4.5);
  assert.equal(edge.lines.at(-1)?.value, "4.46");
  assert.match(edge.note ?? "", /stores this to one decimal \(4\.5\), which is shown rounded as 5/);
});

test("without the stored inputs the arithmetic is left out, not rebuilt from other figures", () => {
  const why = explainRecommendation(debtRec, { ...assessment, inputs: null });
  assert.deepEqual(why.working, []);
  assert.equal(why.triggers.length, 2, "the rule and its threshold can still be explained");
  assert.equal(why.drivers.length, 5);
});

test("the share outside the listed drivers is stated, not hidden", () => {
  const why = explainRecommendation(debtRec, assessment);
  assert.ok(Math.abs(why.otherShare - (1 - 0.78)) < 1e-9);
});

test("a recommendation from an older rule set says so", () => {
  const why = explainRecommendation(stored({ ...debtRec, rulesVersion: "0.9" }), assessment);
  assert.equal(why.staleRules, true);

  const gone = explainRecommendation(
    stored({ trace: [{ ruleId: "RETIRED_RULE", tier: "High", driver: null, indicator: null, userValue: null }] }),
    assessment
  );
  assert.match(gone.triggers[0].text, /no longer in the current rule set/);
});

test("every recommendation the engine produces can be explained, and the values agree", () => {
  // End to end with the real engine: the explanation must never fall behind the rules.
  const recs = generateRecommendations({
    prediction: {
      riskLevel: assessment.riskLevel,
      topDrivers: assessment.drivers,
      indicators
    },
    creditScore: inputs.credit_score
  });

  assert.ok(recs.length > 0);
  for (const rec of recs) {
    const why = explainRecommendation({ ...rec, recommendationId: rec.ruleId, description: rec.description }, assessment);
    assert.equal(why.staleRules, false);
    assert.ok(why.triggers.length > 0, `${rec.ruleId} has no trigger`);
    assert.ok(
      why.triggers.every((t) => !/no longer in the current rule set/.test(t.text)),
      `${rec.ruleId} refers to a rule the explainer cannot find`
    );
    // Anything tied to a figure must show its arithmetic.
    if (!why.followsFromTier) assert.ok(why.working.length > 0, `${rec.ruleId} has no working`);
  }
});
