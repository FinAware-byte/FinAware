import assert from "node:assert/strict";
import { test } from "node:test";
import type { MlFeaturePayload, MlPrediction } from "../../lib/risk/types";
import { assessFinancialRisk, type CallJson } from "../../services/financial-api/src/assess";

const features: MlFeaturePayload = {
  monthly_income_zar: 35000, monthly_expenses_zar: 22000, savings_zar: 85000, credit_score: 650, has_loan: "Yes",
  loan_amount_zar: 180000, monthly_emi_zar: 4200, loan_interest_rate_pct: 12.5, age: 32, employment_status: "Employed"
};
const prediction: MlPrediction = {
  riskLevel: "Medium", riskScore: 49.1, predictedProbability: 0.98,
  probabilities: { Low: 0.02, Medium: 0.978, High: 0.002 },
  topDrivers: [], explanationMethod: "shap_tree",
  indicators: { debtToIncomeRatio: 0.12, expenseToIncomeRatio: 0.63, savingsToIncomeRatio: 0.2, savingsCoverageMonths: 3.86, disposableIncome: 13000, monthlySurplusAfterEmi: 8800, loanToIncomeRatio: 0.43 },
  model: { name: "Gradient Boosting", version: "1.0" }, targetVersion: "1.0", targetStatus: "proposed", warnings: []
};

function fakeServices(overrides: { ml?: { status: number; payload: unknown }; profile?: boolean } = {}) {
  const calls: string[] = [];
  const callJson: CallJson = async (name, path, init) => {
    calls.push(`${name} ${init?.method ?? "GET"} ${path}`);
    if (name === "financial-data" && path.startsWith("/financial-data/")) {
      return overrides.profile === false
        ? { status: 200, payload: { profile: null, features: null } }
        : { status: 200, payload: { profile: { profileId: "p1" }, features } };
    }
    if (name === "ml") return overrides.ml ?? { status: 200, payload: prediction };
    if (path.startsWith("/risk-assessments/by-id/") && path.endsWith("/recommendations")) return { status: 201, payload: { created: 1 } };
    if (path.startsWith("/risk-assessments/by-id/")) return { status: 200, payload: { assessmentId: "a1", riskLevel: "Medium" } };
    if (path.startsWith("/risk-assessments/")) return { status: 201, payload: { assessmentId: "a1" } };
    return { status: 404, payload: {} };
  };
  return { calls, callJson };
}

test("success follows the sequence diagram order: retrieve → predict → store → recommend → return", async () => {
  const { calls, callJson } = fakeServices();
  const result = await assessFinancialRisk("7", callJson);
  assert.equal(result.status, 201);
  assert.deepEqual(calls, [
    "financial-data GET /financial-data/7",
    "ml POST /predict",
    "financial-data POST /risk-assessments/7",
    "financial-data POST /risk-assessments/by-id/a1/recommendations",
    "financial-data GET /risk-assessments/by-id/a1"
  ]);
});

test("ML service down → MODEL_UNAVAILABLE and nothing is stored", async () => {
  const { calls, callJson } = fakeServices({ ml: { status: 503, payload: { message: "ml service unavailable" } } });
  const result = await assessFinancialRisk("7", callJson);
  assert.equal(result.status, 503);
  assert.equal((result.body as { error: string }).error, "MODEL_UNAVAILABLE");
  assert.ok(!calls.some((c) => c.includes("POST /risk-assessments")));
});

test("invalid prediction (probabilities do not sum to 1) → PREDICTION_FAILED and nothing is stored", async () => {
  const bad = { ...prediction, probabilities: { Low: 0.5, Medium: 0.5, High: 0.5 } };
  const { calls, callJson } = fakeServices({ ml: { status: 200, payload: bad } });
  const result = await assessFinancialRisk("7", callJson);
  assert.equal(result.status, 502);
  assert.equal((result.body as { error: string }).error, "PREDICTION_FAILED");
  assert.ok(!calls.some((c) => c.includes("POST /risk-assessments")));
});

test("riskLevel that is not the most probable class is rejected", async () => {
  const bad = { ...prediction, riskLevel: "High" as const };
  const { callJson } = fakeServices({ ml: { status: 200, payload: bad } });
  assert.equal((await assessFinancialRisk("7", callJson)).status, 502);
});

test("no financial profile → PROFILE_REQUIRED without calling the ML service", async () => {
  const { calls, callJson } = fakeServices({ profile: false });
  const result = await assessFinancialRisk("7", callJson);
  assert.equal(result.status, 409);
  assert.ok(!calls.some((c) => c.startsWith("ml ")));
});
