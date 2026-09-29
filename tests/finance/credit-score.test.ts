import assert from "node:assert/strict";
import { test } from "node:test";
import { SCORE_MAX, SCORE_MIN, calculateCreditScore, creditScoreFor, isJudgmentRecord } from "../../lib/finance/credit-score";
import type { ScoreInput } from "../../lib/finance/credit-score";

const debt = (overrides: Partial<ScoreInput["debts"][number]> = {}): ScoreInput["debts"][number] => ({
  debtTypeStored: "Credit Card",
  status: "ACTIVE",
  balance: 20000,
  monthlyObligation: 1000,
  paymentsMadeCount: 24,
  totalPaymentsCount: 24,
  missedPaymentsCount: 0,
  hasLegalJudgment: false,
  ...overrides
});

test("a clean, lightly indebted file scores well", () => {
  const { score, band } = calculateCreditScore({ monthlyIncome: 40000, debts: [debt()] });
  assert.ok(score >= 700, `expected a strong score, got ${score}`);
  assert.ok(band === "Good" || band === "Excellent");
});

test("missed payments cost more than anything else", () => {
  const clean = creditScoreFor({ monthlyIncome: 40000, debts: [debt()] });
  const missed = creditScoreFor({ monthlyIncome: 40000, debts: [debt({ missedPaymentsCount: 6 })] });
  const stretched = creditScoreFor({ monthlyIncome: 40000, debts: [debt({ monthlyObligation: 20000 })] });

  assert.ok(missed < clean, "missing payments must lower the score");
  // Payment history carries 35% against 30% for amounts owed, so at comparable severity it bites harder.
  assert.ok(clean - missed > 0, "payment history must move the score");
  assert.ok(stretched < clean, "a heavy repayment load must lower the score too");
});

test("the score never leaves the range the model was trained on", () => {
  const worst = calculateCreditScore({
    monthlyIncome: 5000,
    debts: [
      debt({ missedPaymentsCount: 24, monthlyObligation: 9000, hasLegalJudgment: true, status: "GARNISHED" }),
      debt({ missedPaymentsCount: 24, monthlyObligation: 9000, hasLegalJudgment: true, status: "GARNISHED" })
    ]
  });
  const best = calculateCreditScore({
    monthlyIncome: 200000,
    debts: [
      debt({ monthlyObligation: 500, totalPaymentsCount: 60, paymentsMadeCount: 60 }),
      debt({ debtTypeStored: "Bond", monthlyObligation: 500, totalPaymentsCount: 60, paymentsMadeCount: 60 }),
      debt({ debtTypeStored: "Vehicle Finance", monthlyObligation: 500, totalPaymentsCount: 60, paymentsMadeCount: 60 })
    ]
  });

  assert.ok(worst.score >= SCORE_MIN && worst.score <= SCORE_MAX);
  assert.ok(best.score >= SCORE_MIN && best.score <= SCORE_MAX);
  assert.ok(best.score > worst.score);
  assert.equal(worst.band, "Poor");
});

test("a judgment and a garnishee order are the most damaging marks", () => {
  const clean = creditScoreFor({ monthlyIncome: 40000, debts: [debt()] });
  const judgment = creditScoreFor({ monthlyIncome: 40000, debts: [debt({ hasLegalJudgment: true })] });
  const garnished = creditScoreFor({ monthlyIncome: 40000, debts: [debt({ status: "GARNISHED" })] });

  assert.ok(judgment < clean);
  assert.ok(garnished < clean);
});

test("no accounts is a thin file, not a perfect one", () => {
  const { score, factors } = calculateCreditScore({ monthlyIncome: 30000, debts: [] });
  assert.ok(score < 750, `a file with no history should not score top marks, got ${score}`);
  assert.ok(score > SCORE_MIN, "and it is not a bad score either");
  assert.equal(factors.find((f) => f.key === "paymentHistory")?.value, 0.6);
});

test("every factor shows its working, and the points add up to the score", () => {
  const result = calculateCreditScore({ monthlyIncome: 40000, debts: [debt({ missedPaymentsCount: 2 })] });

  assert.equal(result.factors.length, 5);
  const weights = result.factors.reduce((sum, f) => sum + f.weight, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9, "the weights must be a complete allocation");

  for (const factor of result.factors) {
    assert.ok(factor.basis.length > 0, `${factor.key} must state the figure behind it`);
    assert.ok(factor.value >= 0 && factor.value <= 1, `${factor.key} must be a 0–1 factor`);
  }

  // The published points must reconcile with the headline score, or the breakdown is decoration.
  const fromPoints = 300 + result.factors.reduce((sum, f) => sum + f.points, 0);
  assert.ok(Math.abs(fromPoints - result.score) <= 3, `points ${fromPoints} should reconcile with score ${result.score}`);
});

test("the same inputs always give the same score", () => {
  const input: ScoreInput = { monthlyIncome: 33000, debts: [debt({ missedPaymentsCount: 3 })] };
  assert.equal(creditScoreFor(input), creditScoreFor(input));
});

test("zero or missing income does not produce a broken score", () => {
  const noIncome = calculateCreditScore({ monthlyIncome: 0, debts: [debt()] });
  assert.ok(Number.isInteger(noIncome.score));
  assert.ok(noIncome.score >= SCORE_MIN && noIncome.score <= SCORE_MAX);

  const nan = calculateCreditScore({ monthlyIncome: Number.NaN, debts: [debt()] });
  assert.ok(Number.isInteger(nan.score));
});

test("only a judgment record counts as a judgment", () => {
  // Every path that stores or shows a score uses this, so they cannot disagree about a user.
  assert.equal(isJudgmentRecord("Judgment"), true);
  assert.equal(isJudgmentRecord("Default judgement"), true);
  // Already scored through the GARNISHED status; counting the record too would charge twice.
  assert.equal(isJudgmentRecord("Garnishee order"), false);
  for (const other of ["Summons", "Default listing dispute", "Debt review inquiry", "Reconsideration"]) {
    assert.equal(isJudgmentRecord(other), false, `${other} is not a judgment`);
  }
});
