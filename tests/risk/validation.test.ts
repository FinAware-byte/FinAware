import assert from "node:assert/strict";
import { test } from "node:test";
import { clampCreditScore, fieldErrors, financialProfileSchema } from "../../lib/risk/validation";

test("valid profile from form strings is parsed to numbers", () => {
  const result = financialProfileSchema.safeParse({
    monthlyIncome: "42000",
    monthlyExpenses: "22000",
    savings: "8000",
    financialGoal: ""
  });
  assert.ok(result.success);
  assert.deepEqual(result.data, {
    monthlyIncome: 42000,
    monthlyExpenses: 22000,
    savings: 8000,
    financialGoal: null
  });
});

test("blank and negative values give one message per field", () => {
  const result = financialProfileSchema.safeParse({
    monthlyIncome: "",
    monthlyExpenses: "",
    savings: "-1"
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    monthlyIncome: "Monthly income is required",
    monthlyExpenses: "Monthly expenses is required",
    savings: "Savings cannot be negative"
  });
});

test("non-numeric and zero income are rejected", () => {
  const bad = financialProfileSchema.safeParse({ monthlyIncome: "abc", monthlyExpenses: 0, savings: 0 });
  assert.ok(!bad.success);
  assert.equal(fieldErrors(bad.error).monthlyIncome, "Monthly income must be a number");

  const zero = financialProfileSchema.safeParse({ monthlyIncome: 0, monthlyExpenses: 0, savings: 0 });
  assert.ok(!zero.success);
  assert.equal(fieldErrors(zero.error).monthlyIncome, "Monthly income must be greater than R0");
});

test("parsed output re-validates unchanged (API service → data service)", () => {
  const first = financialProfileSchema.parse({ monthlyIncome: 1000, monthlyExpenses: 500, savings: 0 });
  assert.equal(first.financialGoal, null);
  assert.deepEqual(financialProfileSchema.parse(first), first);
});

// The point of the change: a credit score is issued against the user's accounts, so the request
// body is not allowed to carry one. A posted score must not survive validation into the write.
test("a credit score in the request body is stripped, not trusted", () => {
  const forged = financialProfileSchema.parse({
    monthlyIncome: 42000,
    monthlyExpenses: 22000,
    savings: 8000,
    creditScore: 850
  });
  assert.ok(!("creditScore" in forged), "a posted credit score must never reach the database write");
});

test("a score outside the trained range is clamped rather than rejected", () => {
  // Bureau scales can run past 850; the model was trained on 300–850.
  assert.equal(clampCreditScore(900), 850);
  assert.equal(clampCreditScore(250), 300);
  assert.equal(clampCreditScore(772), 772);
  assert.equal(clampCreditScore(688.6), 689, "stored scores are integers");
});

test("a user with no credit profile gets the neutral default, not a crash", () => {
  assert.equal(clampCreditScore(undefined), 600);
  assert.equal(clampCreditScore(null), 600);
  assert.equal(clampCreditScore(Number.NaN), 600);
});
