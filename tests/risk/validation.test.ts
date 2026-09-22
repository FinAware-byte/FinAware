import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldErrors, financialProfileSchema } from "../../lib/risk/validation";

test("valid profile from form strings is parsed to numbers", () => {
  const result = financialProfileSchema.safeParse({
    monthlyIncome: "42000",
    monthlyExpenses: "22000",
    savings: "8000",
    creditScore: "680",
    financialGoal: ""
  });
  assert.ok(result.success);
  assert.deepEqual(result.data, {
    monthlyIncome: 42000,
    monthlyExpenses: 22000,
    savings: 8000,
    creditScore: 680,
    financialGoal: null
  });
});

test("blank, negative and out-of-range values give one message per field", () => {
  const result = financialProfileSchema.safeParse({
    monthlyIncome: "",
    monthlyExpenses: "",
    savings: "-1",
    creditScore: "900"
  });
  assert.ok(!result.success);
  assert.deepEqual(fieldErrors(result.error), {
    monthlyIncome: "Monthly income is required",
    monthlyExpenses: "Monthly expenses is required",
    savings: "Savings cannot be negative",
    creditScore: "Credit score must be between 300 and 850"
  });
});

test("non-numeric income, zero income and fractional credit score are rejected", () => {
  const bad = financialProfileSchema.safeParse({ monthlyIncome: "abc", monthlyExpenses: 0, savings: 0, creditScore: 650.5 });
  assert.ok(!bad.success);
  const errors = fieldErrors(bad.error);
  assert.equal(errors.monthlyIncome, "Monthly income must be a number");
  assert.equal(errors.creditScore, "Credit score must be a whole number");

  const zero = financialProfileSchema.safeParse({ monthlyIncome: 0, monthlyExpenses: 0, savings: 0, creditScore: 600 });
  assert.ok(!zero.success);
  assert.equal(fieldErrors(zero.error).monthlyIncome, "Monthly income must be greater than R0");
});

test("parsed output re-validates unchanged (API service → data service)", () => {
  const first = financialProfileSchema.parse({ monthlyIncome: 1000, monthlyExpenses: 500, savings: 0, creditScore: 700 });
  assert.equal(first.financialGoal, null);
  assert.deepEqual(financialProfileSchema.parse(first), first);
});
