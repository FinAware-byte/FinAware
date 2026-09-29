import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateRisk } from "../../services/financial-api/src/simulate";
import type { CallJson } from "../../services/financial-api/src/assess";

const features = {
  monthly_income_zar: 50000,
  monthly_expenses_zar: 30000,
  savings_zar: 80000,
  credit_score: 700,
  has_loan: "Yes" as const,
  loan_amount_zar: 400000,
  monthly_emi_zar: 9000,
  loan_interest_rate_pct: 11.5,
  age: 40,
  employment_status: "Employed"
};

const prediction = {
  riskLevel: "Medium",
  riskScore: 48.2,
  probabilities: { Low: 0.2, Medium: 0.7, High: 0.1 },
  topDrivers: [],
  indicators: {},
  model: { name: "Gradient Boosting", version: "1.0" }
};

function harness(overrides: Partial<Record<string, { status: number; payload: unknown }>> = {}) {
  const calls: Array<{ name: string; path: string; body: unknown }> = [];
  const callJson: CallJson = async (name, path, init) => {
    calls.push({ name, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const key = `${name}${path}`;
    if (overrides[key]) return overrides[key]!;
    if (name === "financial-data") return { status: 200, payload: { profile: { id: 1 }, features } };
    if (path === "/predict") return { status: 200, payload: prediction };
    if (path === "/what-if") {
      return { status: 200, payload: { currentLevel: "Medium", targetLevel: "Low", levers: [] } };
    }
    return { status: 404, payload: {} };
  };
  return { calls, callJson };
}

test("a simulation is never stored", async () => {
  const { calls, callJson } = harness();
  const result = await simulateRisk("1", { savings_zar: 200000 }, callJson);

  assert.equal(result.status, 200);
  const writes = calls.filter((call) => call.path.startsWith("/risk-assessments"));
  assert.equal(writes.length, 0, "simulating must not create an assessment, driver or recommendation");
});

test("only the fields the user moved are replaced", async () => {
  const { calls, callJson } = harness();
  await simulateRisk("1", { savings_zar: 250000 }, callJson);

  const sent = calls.find((call) => call.path === "/predict")?.body as typeof features;
  assert.equal(sent.savings_zar, 250000, "the moved field is overridden");
  assert.equal(sent.monthly_expenses_zar, features.monthly_expenses_zar, "untouched fields keep stored values");
  assert.equal(sent.employment_status, features.employment_status);
});

test("values the model would reject are refused before it is called", async () => {
  const { calls, callJson } = harness();
  const result = await simulateRisk("1", { savings_zar: -5 }, callJson);

  assert.equal(result.status, 422);
  assert.equal((result.body as { error: string }).error, "INVALID_INPUT");
  assert.equal(calls.length, 0, "no downstream call is made for input that cannot be valid");
});

test("unknown fields are rejected rather than silently passed to the model", async () => {
  const { callJson } = harness();
  const result = await simulateRisk("1", { monthly_income_zar: 999999 }, callJson);
  assert.equal(result.status, 422, "income is not simulatable, so it must not slip through");
});

test("a missing profile asks for one instead of guessing", async () => {
  const { callJson } = harness({
    "financial-data/financial-data/1": { status: 200, payload: { profile: null, features: null } }
  });
  const result = await simulateRisk("1", {}, callJson);
  assert.equal(result.status, 409);
  assert.equal((result.body as { error: string }).error, "PROFILE_REQUIRED");
});

test("the model being down is reported as unavailable, not as a wrong answer", async () => {
  const { callJson } = harness({ "ml/predict": { status: 503, payload: {} } });
  const result = await simulateRisk("1", {}, callJson);
  assert.equal(result.status, 503);
  assert.equal((result.body as { error: string }).error, "MODEL_UNAVAILABLE");
});

test("a failed what-if still returns the probabilities", async () => {
  const { callJson } = harness({ "ml/what-if": { status: 500, payload: {} } });
  const result = await simulateRisk("1", {}, callJson);

  assert.equal(result.status, 200);
  const body = result.body as { prediction: { riskLevel: string }; whatIf: unknown };
  assert.equal(body.prediction.riskLevel, "Medium");
  assert.equal(body.whatIf, null, "the simulation degrades rather than failing outright");
});

// A credit score is an outcome of the accounts, not something a user can set, so it is not a
// lever here either. .strict() rejects it rather than silently ignoring it.
test("a credit score cannot be simulated, even directly through the API", async () => {
  const { calls, callJson } = harness();
  const result = await simulateRisk("1", { credit_score: 850 } as never, callJson);

  assert.equal(result.status, 422);
  assert.equal(calls.length, 0, "no downstream call for a lever that does not exist");
});
