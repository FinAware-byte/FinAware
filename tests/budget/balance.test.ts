import assert from "node:assert/strict";
import { test } from "node:test";
import { movesToCloseGap, buildRecommendation, BENCHMARKS } from "../../lib/budget/balance";
import { buildMoneyPlan } from "../../lib/budget/plan";

const income = 20000;

test("the line furthest above its guide is named first", () => {
  const { moves } = movesToCloseGap({
    shortfall: 3000,
    monthlyIncome: income,
    essentials: [
      { category: "housing", amount: 9000 }, // guide 6600 -> 2400 over
      { category: "groceries", amount: 3600 }, // guide 3000 -> 600 over
      { category: "transport", amount: 1000 } // under guide
    ]
  });

  assert.equal(moves[0].category, "housing", "biggest excess comes first");
  assert.equal(moves[1].category, "groceries");
  assert.ok(!moves.some((move) => move.category === "transport"), "lines within their guide are left alone");
});

test("no more is taken from a line than it sits above its guide", () => {
  const { moves } = movesToCloseGap({
    shortfall: 10000,
    monthlyIncome: income,
    essentials: [{ category: "housing", amount: 9000 }]
  });
  const ceiling = income * BENCHMARKS.housing.share;
  assert.equal(moves[0].amount, 9000 - ceiling, "reduce to the guide, never below it");
});

test("the moves stop once the gap is closed", () => {
  const { moves, stillToFind } = movesToCloseGap({
    shortfall: 1000,
    monthlyIncome: income,
    essentials: [
      { category: "housing", amount: 9000 },
      { category: "groceries", amount: 3600 }
    ]
  });

  assert.equal(moves.length, 1, "one line was enough");
  assert.equal(moves[0].amount, 1000, "and only the amount actually needed");
  assert.equal(stillToFind, 0);
});

test("a gap the moves cannot close is reported, not absorbed", () => {
  const { moves, stillToFind } = movesToCloseGap({
    shortfall: 5000,
    monthlyIncome: income,
    essentials: [{ category: "groceries", amount: 2000 }] // already under its guide
  });

  assert.equal(moves.length, 0);
  assert.equal(stillToFind, 5000, "the user is told money still has to come from somewhere");
});

test("a deficit recommendation says reduce, a surplus one says add", () => {
  const short = buildMoneyPlan({
    monthlyIncome: 12000,
    essentials: [
      { category: "housing", amount: 9000 },
      { category: "groceries", amount: 2500 }
    ],
    debts: [{ debtId: 1, creditor: "Store card", balance: 40000, interestRate: 22 }],
    savings: 0,
    creditScore: 600
  });
  assert.equal(short.status, "deficit");
  assert.ok(short.recommendation.moves.every((move) => move.direction === "reduce"));
  assert.match(short.recommendation.headline, /gap/i);

  const spare = buildMoneyPlan({
    monthlyIncome: 40000,
    essentials: [{ category: "housing", amount: 9000 }],
    debts: [{ debtId: 1, creditor: "Store card", balance: 40000, interestRate: 22 }],
    savings: 20000,
    creditScore: 700
  });
  assert.notEqual(spare.status, "deficit");
  assert.ok(spare.recommendation.moves.length > 0);
  assert.ok(spare.recommendation.moves.every((move) => move.direction === "add"));
});

test("the held-back buffer is not presented as advice to add money somewhere", () => {
  const plan = buildMoneyPlan({
    monthlyIncome: 40000,
    essentials: [{ category: "housing", amount: 9000 }],
    debts: [],
    savings: 50000,
    creditScore: 700
  });
  assert.ok(!plan.recommendation.moves.some((move) => move.label === "Leave unallocated"));
});

test("changing a figure changes the advice", () => {
  const base = {
    essentials: [{ category: "housing" as const, amount: 9000 }],
    debts: [{ debtId: 1, creditor: "Store card", balance: 40000, interestRate: 22 }],
    savings: 5000,
    creditScore: 650
  };

  const poorer = buildMoneyPlan({ ...base, monthlyIncome: 10000 });
  const richer = buildMoneyPlan({ ...base, monthlyIncome: 45000 });

  assert.equal(poorer.status, "deficit");
  assert.notEqual(richer.status, "deficit");
  assert.notEqual(poorer.recommendation.headline, richer.recommendation.headline);
});

test("recommendations never tell someone their spending is wrong", () => {
  const { moves } = movesToCloseGap({
    shortfall: 2000,
    monthlyIncome: income,
    essentials: [{ category: "housing", amount: 9000 }]
  });
  const text = moves.map((move) => move.reason).join(" ");
  assert.doesNotMatch(text, /too much|overspend|wasteful|should not|irresponsible/i);
  assert.match(text, /common guide/i, "the benchmark is offered as a guide, not a rule");
});
