import assert from "node:assert/strict";
import { test } from "node:test";
import { computedActions, computedSummary } from "../../lib/ai/computed-actions";
import type { AppDebt } from "../../lib/domain";

const debt = (overrides: Partial<AppDebt> = {}): AppDebt =>
  ({
    id: "1",
    debtId: 1,
    userId: 1,
    creditorName: "Store card",
    debtType: "STORE_CARD",
    interestRate: 22.5,
    balance: 20000,
    status: "ACTIVE",
    monthlyObligation: 675,
    paymentsMadeCount: 10,
    totalPaymentsCount: 12,
    missedPaymentsCount: 2,
    hasLegalJudgment: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }) as AppDebt;

const user = { monthlyIncome: 30000, creditScore: 620 };

// formatZAR uses en-ZA, which separates with non-breaking spaces. Tests should check the figure,
// not the byte used to space it.
const plain = (text: string) => text.replace(/\u00a0/g, " ");

test("the most expensive account is named with what it costs this month", () => {
  const actions = computedActions({
    user,
    debts: [debt(), debt({ debtId: 2, creditorName: "Vehicle finance", interestRate: 11, balance: 150000 })],
    netCashflow: 2000
  });

  // 20 000 x 22.5% / 12 = 375
  assert.match(actions[0].text, /Store card/, "highest rate first, not biggest balance");
  assert.match(plain(actions[0].text), /R 375,00/);
});

test("every action is specific to this user's figures, not general advice", () => {
  const actions = computedActions({ user, debts: [debt()], netCashflow: 2000 });
  assert.ok(actions.length >= 2);

  // Each action must carry a figure of its own: an amount, a count or a rate.
  const vague = actions.filter((action) => !/\d/.test(action.text));
  assert.deepEqual(vague, [], "advice with no numbers in it is exactly what this replaces");

  // And most of them should be money, not just counts.
  const withRands = actions.filter((action) => /R\s?\d/.test(plain(action.text)));
  assert.ok(withRands.length >= 2, "at least the interest and payoff actions quote rands");
});

test("an extra payment is quoted with the months and interest it actually saves", () => {
  const actions = computedActions({ user, debts: [debt()], netCashflow: 2000 });
  const payoff = actions.find((action) => /clears your debt in/.test(action.text));
  assert.ok(payoff, "expected a payoff action");
  assert.match(payoff!.text, /\d+ months instead of \d+/);
  assert.match(payoff!.text, /saves about R/);
});

test("a shortfall is stated as an amount, not as a euphemism", () => {
  const actions = computedActions({ user, debts: [debt()], netCashflow: -1450 });
  const gap = actions.find((action) => /short each month/.test(action.text));
  assert.ok(gap);
  assert.match(plain(gap!.text), /R 1 450,00/);
  assert.ok(!actions.some((action) => /clears your debt in/.test(action.text)), "no payoff promise while short");
});

test("missed payments are counted, and attributed to an account", () => {
  const actions = computedActions({
    user,
    debts: [debt({ missedPaymentsCount: 2 }), debt({ debtId: 2, creditorName: "NSFAS", missedPaymentsCount: 5 })],
    netCashflow: 1000
  });
  const missed = actions.find((action) => /missed payment/.test(action.text));
  assert.match(missed!.text, /7 missed payments/);
  assert.match(missed!.text, /5 of them on NSFAS/);
});

test("a clean record is acknowledged instead of warned about", () => {
  const actions = computedActions({ user, debts: [debt({ missedPaymentsCount: 0 })], netCashflow: 1000 });
  assert.ok(actions.some((action) => /on time/.test(action.text)));
});

test("the summary totals what interest costs across every account", () => {
  const summary = computedSummary({
    user,
    // 375 + 1375 = 1750 a month in interest
    debts: [debt(), debt({ debtId: 2, creditorName: "Loan", interestRate: 22, balance: 75000 })],
    netCashflow: 1000
  });
  assert.match(plain(summary), /R 1 750,00/);
  assert.match(summary, /2 accounts/);
});

test("no debt produces no invented actions", () => {
  assert.deepEqual(computedActions({ user, debts: [], netCashflow: 5000 }), []);
  assert.match(computedSummary({ user, debts: [], netCashflow: 5000 }), /no active debt/i);
});

test("each action carries a display figure separate from its sentence", () => {
  const actions = computedActions({ user, debts: [debt()], netCashflow: 2000 });

  for (const action of actions) {
    assert.ok(action.headline.length > 0, "every action needs something to lead with");
    assert.ok(action.detail.length > 0, "and the reasoning underneath");
    assert.ok(action.basis.length > 0, "and its working, so a figure can be checked");
    assert.ok(["urgent", "opportunity", "steady"].includes(action.tone));
  }

  const interest = actions[0];
  assert.equal(interest.amount, "R 375,00".replace(/ /g, " "));
  assert.match(interest.amountLabel ?? "", /interest this month/);
  assert.equal(interest.tone, "urgent", "the most expensive debt leads");
});

test("a clean payment record reads as steady, not urgent", () => {
  const actions = computedActions({ user, debts: [debt({ missedPaymentsCount: 0 })], netCashflow: 2000 });
  const record = actions.find((action) => /unbroken/.test(action.headline));
  assert.equal(record?.tone, "steady");
  assert.equal(record?.amount, "0");
});

test("an opportunity is never shown to someone who is short", () => {
  const actions = computedActions({ user, debts: [debt()], netCashflow: -1450 });
  assert.ok(!actions.some((action) => action.tone === "opportunity"), "no upside framing while the month does not balance");
  assert.equal(actions.find((action) => /gap/.test(action.headline))?.tone, "urgent");
});

test("every action shows its working, ending in the figure the action quotes", () => {
  // Several profiles, so each kind of action appears at least once: surplus, shortfall, clean record.
  const cases = [
    computedActions({
      user,
      debts: [debt(), debt({ debtId: 2, creditorName: "Clothing account", interestRate: 19, balance: 3000, monthlyObligation: 300 })],
      netCashflow: 2000
    }),
    computedActions({ user, debts: [debt()], netCashflow: -1500 }),
    computedActions({ user, debts: [debt({ missedPaymentsCount: 0 })], netCashflow: 2000 })
  ];

  const seen = new Set<string>();
  for (const actions of cases) {
    for (const action of actions) {
      seen.add(action.tone + action.headline.split(" ")[0]);
      assert.ok(action.working.length > 0, `"${action.headline}" has no working`);
      const results = action.working.filter((line) => line.result).map((line) => line.value);
      assert.ok(results.length > 0, `"${action.headline}" working never reaches an answer`);
      if (action.amount) {
        assert.ok(
          results.includes(action.amount),
          `"${action.headline}" quotes ${action.amount} but its working ends in ${results.join(", ")}`
        );
      }
    }
  }
  assert.ok(seen.size >= 5, "the cases should cover the different kinds of action");
});

test("the interest working shows the balance and rate it multiplies", () => {
  const [first] = computedActions({ user, debts: [debt()], netCashflow: 2000 });
  const labels = first.working.map((line) => `${line.label}: ${plain(line.value)}`);
  assert.ok(labels.includes("Store card balance: R 20 000,00"), labels.join(" | "));
  assert.ok(labels.some((line) => line.endsWith("22.50%")));
  assert.ok(labels.includes("= Interest this month: R 375,00"));
});
