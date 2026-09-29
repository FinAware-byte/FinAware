import assert from "node:assert/strict";
import { test } from "node:test";
import { monthsUntil, parseGoal, testGoal, type GoalInput } from "../../lib/budget/goal";
import { buildMoneyPlan, simulatePayoff, type PlanDebt } from "../../lib/budget/plan";

const plain = (text: string) => text.replace(/ /g, " ");

// 27 September 2026 — the goals below are all read relative to it.
const today = new Date(2026, 8, 27);
const from = { year: 2026, month: 8 };

test("the example from the brief: R10 000 by December", () => {
  const goal = parseGoal("save R10 000 by December", today);
  assert.equal(goal.amount, 10000);
  assert.deepEqual(goal.deadline, { year: 2026, month: 11 });
  assert.equal(monthsUntil(goal.deadline!, from), 3, "October, November and December");
  assert.deepEqual(goal.understood, ["R10 000", "by December"]);
});

test("amounts are read the way South Africans write them", () => {
  const cases: Array<[string, number]> = [
    ["R10,000 for a holiday", 10000],
    ["R10000", 10000],
    ["R 2 500,50 by May", 2500.5],
    ["R15k by March", 15000],
    ["R1.5m for a house deposit", 1500000],
    ["save 12 000 by June", 12000],
    ["put away 5k in 6 months", 5000]
  ];
  for (const [text, expected] of cases) {
    assert.equal(parseGoal(text, today).amount, expected, text);
  }
  // A number of months is never an amount.
  assert.equal(parseGoal("in 3 months", today).amount, null);
});

test("deadlines: named months, relative periods and dates", () => {
  const deadline = (text: string) => parseGoal(text, today).deadline;
  assert.deepEqual(deadline("R5k in 6 months"), { year: 2027, month: 2 });
  assert.deepEqual(deadline("R5k within a year"), { year: 2027, month: 8 });
  assert.deepEqual(deadline("R5k by March 2027"), { year: 2027, month: 2 });
  assert.deepEqual(deadline("R5k by 2027-06-30"), { year: 2027, month: 5 });
  assert.deepEqual(deadline("R5k by 30/06/2027"), { year: 2027, month: 5 }, "day/month/year, not month/day");
  assert.deepEqual(deadline("R5k before Christmas"), { year: 2026, month: 11 });
  assert.deepEqual(deadline("R5k by the end of the year"), { year: 2026, month: 11 });
  // Said in September, "by September" is next September: this one is already under way.
  assert.deepEqual(deadline("R5k by September"), { year: 2027, month: 8 });
  assert.deepEqual(deadline("R5k by February"), { year: 2027, month: 1 }, "an earlier month name is next year's");
  assert.equal(deadline("R5k someday"), null);
});

test("an emergency fund is read as months of essentials, not an amount", () => {
  const goal = parseGoal("Build a 3-month emergency fund", today);
  assert.equal(goal.emergencyFundMonths, 3);
  assert.equal(goal.amount, null);
  assert.equal(parseGoal("six months of expenses saved by June", today).emergencyFundMonths, 6);
  assert.equal(parseGoal("start an emergency fund", today).emergencyFundMonths, 3, "three months is the usual guide");
});

// ---------------------------------------------------------------------------------------------

const debts: PlanDebt[] = [
  { debtId: 1, creditor: "Store card", balance: 18000, interestRate: 24, minimumPayment: 900 },
  { debtId: 2, creditor: "Personal loan", balance: 40000, interestRate: 16, minimumPayment: 1600 }
];

// Income 25 000, essentials 15 000, minimums 2 500 → 7 500 surplus. The plan keeps 1 250 back
// (5% of income), puts nothing to the starter buffer (savings already cover a month), and sends
// the remaining 6 250 to the store card.
const plan = buildMoneyPlan({
  monthlyIncome: 25000,
  essentials: [{ category: "housing", amount: 15000 }],
  debts,
  savings: 20000,
  creditScore: 640
});

const goal = (overrides: Partial<GoalInput> = {}): GoalInput => ({
  target: 10000,
  alreadySaved: 0,
  deadline: { year: 2026, month: 11 },
  from,
  isEmergencyFund: false,
  ...overrides
});

test("the plan the tests rely on is shaped as described", () => {
  assert.equal(plan.status, "healthy");
  assert.equal(plan.allocations.find((a) => a.key === "extra_debt")?.amount, 6250);
  assert.equal(plan.allocations.find((a) => a.key === "breathing_room")?.amount, 1250);
});

test("the monthly amount is the gap divided by the months, rounded up so the goal is reached", () => {
  const result = testGoal(goal({ target: 10000 }), plan);
  // 10 000 over 3 months = 3 333.33…, rounded up to 3 334.
  assert.equal(result.monthly, 3334);
  assert.ok(result.monthly * result.months >= 10000);
  assert.equal(result.working.at(-1)?.label, "= Every month, rounded up to the rand");
});

test("taking from the extra debt payment is costed with the plan's own payoff simulation", () => {
  const result = testGoal(goal({ target: 10000 }), plan);
  assert.equal(result.verdict, "fits_with_tradeoff");
  assert.equal(result.sources[0].key, "extra_debt");
  assert.equal(result.sources[0].amount, 3334);

  // The impact must be exactly what simulating the smaller extra payment gives — for the three
  // months of the goal only. Afterwards the full 6 250 goes back to debt.
  const before = simulatePayoff(debts, 6250);
  const after = simulatePayoff(debts, (month) => (month <= 3 ? 6250 - 3334 : 6250));
  assert.equal(result.debtImpact?.monthsBefore, before.months);
  assert.equal(result.debtImpact?.monthsAfter, after.months);
  assert.ok(result.debtImpact!.monthsAfter! >= result.debtImpact!.monthsBefore!, "less going to debt never clears it sooner");
  assert.ok(result.debtImpact!.moreInterest > 0);
  assert.match(result.summary, /debt-free in/);
});

test("the debt payment is only borrowed for the months of the goal, not for the rest of the payoff", () => {
  // The live bug: a one-year goal simulated as a permanently smaller payment cost R133 000 of
  // interest on a bond. Borrowing 10 000 over 3 months cannot cost more than a small fraction of it.
  const result = testGoal(goal({ target: 10000 }), plan);
  const permanent = simulatePayoff(debts, 6250 - 3334).interest - simulatePayoff(debts, 6250).interest;
  assert.ok(result.debtImpact!.moreInterest < permanent / 2, `${result.debtImpact!.moreInterest} vs permanent ${permanent}`);
  assert.ok(result.debtImpact!.monthsAfter! - result.debtImpact!.monthsBefore! <= 2, "three months of a smaller payment delays payoff by a month or two");
});

test("a goal that needs the breathing room is called tight", () => {
  // 7 000 a month: all 6 250 of the extra payment and 750 of the 1 250 breathing room.
  const result = testGoal(goal({ target: 21000 }), plan);
  assert.equal(result.verdict, "tight");
  assert.deepEqual(result.sources.map((s) => [s.key, s.amount]), [["extra_debt", 6250], ["breathing_room", 750]]);
  assert.match(plain(result.summary), /R 750,00 of the breathing room/);
});

test("a goal the plan cannot reach says when it could, and what the deadline would reach", () => {
  // 30 000 in 3 months needs 10 000 a month; the plan can spare 6 250 without the breathing room.
  const result = testGoal(goal({ target: 30000 }), plan);
  assert.equal(result.verdict, "does_not_fit");
  // 30 000 ÷ 6 250 = 4.8 → 5 months from September → February 2027. 6 250 × 3 = 18 750 by December.
  assert.match(plain(result.summary), /by February 2027/);
  assert.match(plain(result.summary), /R 18 750,00 by December 2026/);
});

test("money already put aside is taken off first", () => {
  const result = testGoal(goal({ target: 10000, alreadySaved: 7000 }), plan);
  assert.equal(result.stillToSave, 3000);
  assert.equal(result.monthly, 1000);
});

test("an emergency fund counts the savings on record, and the safety-net money only up to its target", () => {
  const tight = buildMoneyPlan({
    monthlyIncome: 25000,
    essentials: [{ category: "housing", amount: 15000 }],
    debts,
    savings: 5000,
    creditScore: 640
  });
  const starter = tight.allocations.find((a) => a.key === "starter_buffer")!;
  // One month of essentials (15 000) less 5 000 saved: the plan fills a 10 000 gap at 3 750 a month.
  assert.equal(starter.amount, 3750);
  assert.equal(starter.targetAmount, 15000);

  const result = testGoal(
    goal({ target: 3 * 15000, alreadySaved: tight.savings, isEmergencyFund: true, deadline: { year: 2027, month: 8 } }),
    tight
  );
  assert.equal(result.stillToSave, 40000);
  assert.equal(result.monthly, 3334);

  // The live bug: this month's 3 750 was counted for all 12 months, so the goal "fit with nothing
  // else changing" — but the plan stops funding the net once it holds 15 000, after about three
  // months, and sends that money to debt. Over 12 months the net only receives the 10 000 gap.
  const buffer = result.sources.find((s) => s.key === "buffer")!;
  assert.ok(Math.abs(buffer.amount - 10000 / 12) < 0.01, `expected about 833.33, got ${buffer.amount}`);
  assert.match(buffer.note ?? "", /only until your safety net reaches/);
  assert.equal(result.verdict, "fits_with_tradeoff", "the rest comes out of the extra debt payment");
  assert.ok(result.sources.some((s) => s.key === "extra_debt"));
  assert.ok(result.debtImpact, "and that is costed");
  // The debt pool is today's 2 500 plus the 3 750 − 833.33 that moves to debt once the net is full.
  assert.ok(Math.abs(result.debtImpact!.extraBefore - (2500 + 3750 - 10000 / 12)) < 0.02);
});

test("a plan already short every month has nothing to save from", () => {
  const short = buildMoneyPlan({
    monthlyIncome: 15000,
    essentials: [{ category: "housing", amount: 14000 }],
    debts,
    savings: 0,
    creditScore: 600
  });
  const result = testGoal(goal(), short);
  assert.equal(result.verdict, "no_surplus");
  assert.deepEqual(result.sources, []);
});

test("a goal that fits in spare money changes nothing else", () => {
  const debtFree = buildMoneyPlan({
    monthlyIncome: 25000,
    essentials: [{ category: "housing", amount: 12000 }],
    debts: [],
    savings: 80000,
    creditScore: 700
  });
  const result = testGoal(goal({ target: 6000 }), debtFree);
  assert.equal(result.verdict, "fits");
  assert.equal(result.debtImpact, null);
});

test("a deadline this month or earlier asks for a later one", () => {
  assert.equal(testGoal(goal({ deadline: from }), plan).verdict, "no_time");
});
