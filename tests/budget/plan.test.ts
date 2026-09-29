import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMoneyPlan, minimumFor, simulatePayoff, type PlanInput } from "../../lib/budget/plan";

const essentials = [
  { category: "housing" as const, amount: 8000 },
  { category: "groceries" as const, amount: 3500 },
  { category: "transport" as const, amount: 1500 },
  { category: "utilities" as const, amount: 1000 }
]; // 14 000

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    monthlyIncome: 30000,
    essentials,
    debts: [
      { debtId: 1, creditor: "Store card", balance: 12000, interestRate: 22.5 },
      { debtId: 2, creditor: "Vehicle finance", balance: 90000, interestRate: 11.0 }
    ],
    savings: 5000,
    creditScore: 640,
    ...overrides
  };
}

test("surplus is income minus essentials minus the debt minimums", () => {
  const plan = buildMoneyPlan(input());
  const expectedMinimums = plan.debtMinimumsTotal;
  assert.equal(plan.essentialsTotal, 14000);
  assert.equal(plan.surplus, Math.round((30000 - 14000 - expectedMinimums) * 100) / 100);
});

test("every rand of the surplus is accounted for", () => {
  const plan = buildMoneyPlan(input());
  const allocated = plan.allocations.reduce((sum, item) => sum + item.amount, 0);
  assert.ok(Math.abs(allocated + plan.unallocated - plan.surplus) < 0.05, "allocations must sum to the surplus");
});

test("extra payment goes to the highest interest rate, not the biggest balance", () => {
  const plan = buildMoneyPlan(input());
  const extra = plan.allocations.find((item) => item.key === "extra_debt");
  assert.ok(extra, "there should be an extra debt payment");
  assert.match(extra!.target ?? "", /Store card/, "22.5% beats the larger 11% vehicle balance");
});

test("a thin safety net is funded before extra debt payments, but never with everything", () => {
  const plan = buildMoneyPlan(input({ savings: 0 }));
  const buffer = plan.allocations.find((item) => item.key === "starter_buffer");
  assert.ok(buffer, "with no savings, the buffer must be funded");
  assert.ok(buffer!.amount <= plan.surplus * 0.5 + 0.01, "at most half the surplus goes to the buffer");
  assert.ok(
    plan.allocations.some((item) => item.key === "extra_debt"),
    "debt is still attacked in the same month"
  );
});

test("an already-funded safety net is not topped up again", () => {
  const plan = buildMoneyPlan(input({ savings: 50000 }));
  assert.equal(plan.allocations.find((item) => item.key === "starter_buffer"), undefined);
});

test("a deficit is reported honestly instead of being allocated away", () => {
  const plan = buildMoneyPlan(input({ monthlyIncome: 15000 }));
  assert.equal(plan.status, "deficit");
  assert.equal(plan.allocations.length, 0);
  assert.equal(plan.payoff, null, "no payoff projection when the minimums are not affordable");
  assert.ok(plan.shortfall && plan.shortfall > 0, "the gap is reported as a number for the page to format");
  assert.equal(plan.shortfall, Math.abs(plan.surplus));
});

test("paying extra clears debt sooner and costs less interest", () => {
  const plan = buildMoneyPlan(input());
  assert.ok(plan.payoff, "payoff projection expected");
  const { monthsOnMinimums, monthsWithPlan, interestSaved, monthsSaved } = plan.payoff!;
  assert.ok(monthsWithPlan! < monthsOnMinimums!, "the plan must clear the debt sooner");
  assert.ok(interestSaved > 0, "and cost less interest");
  assert.equal(monthsSaved, monthsOnMinimums! - monthsWithPlan!);
});

test("payoff simulation charges interest before payment", () => {
  // One debt, no extra: after one month the balance must have grown by interest and shrunk by
  // the minimum, so total interest is the first month's interest at minimum.
  const debt = { debtId: 1, creditor: "Test", balance: 10000, interestRate: 12 };
  const firstMonthInterest = (10000 * 0.12) / 12; // 100
  const result = simulatePayoff([debt], 0);
  assert.ok(result.interest >= firstMonthInterest, "interest accrues from the first month");
  assert.ok(result.months !== null && result.months > 1);
});

test("no debts means no payoff projection and savings advice instead", () => {
  const plan = buildMoneyPlan(input({ debts: [], savings: 60000 }));
  assert.equal(plan.payoff, null);
  assert.ok(plan.allocations.some((item) => item.key === "full_buffer" || item.key === "long_term"));
});

test("the minimum payment matches the figure the dashboard already shows", () => {
  const debt = { debtId: 1, creditor: "Test", balance: 100000, interestRate: 12 };
  // max(350, interest + 1.5% of balance) = max(350, 1000 + 1500)
  assert.equal(minimumFor(debt), 2500);
});

test("an explicit minimum payment overrides the estimate", () => {
  assert.equal(minimumFor({ debtId: 1, creditor: "T", balance: 100000, interestRate: 12, minimumPayment: 1800 }), 1800);
});

test("missing essentials are flagged rather than silently treated as zero", () => {
  const plan = buildMoneyPlan(input({ essentials: [] }));
  assert.match(plan.warnings.join(" "), /No essential expenses/);
});

test("credit guidance never promises a score change", () => {
  const plan = buildMoneyPlan(input());
  const text = plan.creditActions.map((a) => `${a.title} ${a.detail} ${a.why}`).join(" ");
  assert.doesNotMatch(text, /\+\s*\d+\s*points?|score will (rise|increase|go up)|guarantee/i);
});

test("a high missed-payment probability changes the wording, not the amounts", () => {
  const withRisk = buildMoneyPlan(input({ missedPaymentProbability: 0.62 }));
  const withoutRisk = buildMoneyPlan(input({ missedPaymentProbability: null }));

  assert.deepEqual(
    withRisk.allocations.map((a) => a.amount),
    withoutRisk.allocations.map((a) => a.amount),
    "a model probability must never move money on its own"
  );
  assert.match(withRisk.creditActions[0].detail, /62%/);
});

test("debts that cannot be cleared are reported as unknown, not as a made-up number", () => {
  // A minimum below the monthly interest would never clear: force it with an explicit minimum.
  const result = simulatePayoff(
    [{ debtId: 1, creditor: "Trap", balance: 100000, interestRate: 30, minimumPayment: 10 }],
    0
  );
  assert.equal(result.months, null);
});
