import assert from "node:assert/strict";
import { test } from "node:test";
import { coachCreditScore } from "../../lib/finance/score-coach";
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

test("the step with the most points to gain is the one put first", () => {
  const coaching = coachCreditScore({
    monthlyIncome: 30000,
    debts: [debt({ missedPaymentsCount: 8 })]
  });

  assert.equal(coaching.topStep?.factorKey, "paymentHistory", "8 missed payments should dominate");
  // The list must be ordered, not just the top item.
  for (let i = 1; i < coaching.steps.length; i += 1) {
    assert.ok(coaching.steps[i - 1].headroom >= coaching.steps[i].headroom, "steps must be ordered by points available");
  }
});

test("a stretched but punctual borrower is pointed at repayments, not payments", () => {
  const coaching = coachCreditScore({
    monthlyIncome: 20000,
    debts: [debt({ monthlyObligation: 9000, missedPaymentsCount: 0 })]
  });

  assert.equal(coaching.topStep?.factorKey, "amountsOwed");
  // The advice has to name the actual monthly reduction, not say "reduce your debt".
  assert.match(coaching.topStep!.action, /R\s?\d/, "the action must quote a rand figure");
});

test("the reduction quoted is the real gap to 15% of income", () => {
  // 20 000 income, 9 000 repayments. 15% of income = 3 000, so the gap is 6 000.
  const coaching = coachCreditScore({
    monthlyIncome: 20000,
    debts: [debt({ monthlyObligation: 9000 })]
  });
  const step = coaching.steps.find((s) => s.factorKey === "amountsOwed");
  assert.match(step!.action.replace(/ /g, " "), /R 6 000,00/);
});

test("headroom is the points actually being given up, and totals the gap to 850", () => {
  const coaching = coachCreditScore({ monthlyIncome: 30000, debts: [debt({ missedPaymentsCount: 4 })] });

  // Score + everything still on the table should reach the ceiling, give or take rounding.
  const reachable = coaching.score + coaching.totalHeadroom;
  assert.ok(Math.abs(reachable - 850) <= 5, `score ${coaching.score} + headroom ${coaching.totalHeadroom} should approach 850`);
});

test("a near-perfect file is told there is nothing to chase", () => {
  const coaching = coachCreditScore({
    monthlyIncome: 200000,
    debts: [
      debt({ monthlyObligation: 500, totalPaymentsCount: 60, paymentsMadeCount: 60 }),
      debt({ debtTypeStored: "Bond", monthlyObligation: 500, totalPaymentsCount: 60 }),
      debt({ debtTypeStored: "Vehicle Finance", monthlyObligation: 500, totalPaymentsCount: 60 })
    ]
  });

  assert.ok(coaching.score >= 800);
  assert.equal(coaching.toNextBand, null, "already in the top band");
});

test("account mix never advises opening a new account", () => {
  const coaching = coachCreditScore({ monthlyIncome: 30000, debts: [debt()] });
  const mix = coaching.steps.find((s) => s.factorKey === "creditMix");

  assert.match(mix!.action, /[Dd]o not open/, "opening credit to chase 55 points is bad advice and must not be given");
});

test("the distance to the next band is stated in points", () => {
  const coaching = coachCreditScore({ monthlyIncome: 25000, debts: [debt({ missedPaymentsCount: 3 })] });

  if (coaching.toNextBand) {
    assert.ok(coaching.toNextBand.points > 0);
    assert.ok(["Fair", "Good", "Excellent"].includes(coaching.toNextBand.band));
    assert.equal(coaching.score + coaching.toNextBand.points >= 580, true);
  }
});

test("steps the user cannot act on today are marked as waiting on time", () => {
  const coaching = coachCreditScore({
    monthlyIncome: 30000,
    debts: [debt({ totalPaymentsCount: 6, paymentsMadeCount: 6, missedPaymentsCount: 0 })]
  });

  const history = coaching.steps.find((s) => s.factorKey === "historyLength");
  assert.equal(history?.waitingOnTime, true, "a short record fills up with time, not with action");
  assert.match(history!.action, /42 away/, "and it should say how much time");
});

test("no debts at all still produces usable coaching, not a crash", () => {
  const coaching = coachCreditScore({ monthlyIncome: 18000, debts: [] });
  assert.equal(coaching.steps.length, 5);
  assert.ok(coaching.steps.every((step) => step.current.length > 0 && step.action.length > 0));
});
