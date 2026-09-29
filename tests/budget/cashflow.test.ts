import assert from "node:assert/strict";
import { test } from "node:test";
import { forecastCashflow, paydayIn } from "../../lib/budget/cashflow";
import type { PlanDebt } from "../../lib/budget/plan";
import { usualDueDay } from "../../lib/microservices/budget-service";

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);
const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

test("payday on a weekend moves to the Friday before, as employers pay", () => {
  // 25 October 2026 is a Sunday; 25 July 2026 a Saturday; 25 November 2026 a Wednesday.
  assert.ok(same(paydayIn(2026, 9, 25), day(2026, 10, 23)));
  assert.ok(same(paydayIn(2026, 6, 25), day(2026, 7, 24)));
  assert.ok(same(paydayIn(2026, 10, 25), day(2026, 11, 25)));
  // A payday of the 31st in a 30-day month is the 30th.
  assert.ok(same(paydayIn(2026, 10, 31), day(2026, 11, 30)));
});

test("due days are read in South African time, not UTC", () => {
  // Stored as 22:00 UTC on the 24th — which is midnight on the 25th in Johannesburg.
  const stored = [new Date("2025-10-24T22:00:00Z"), new Date("2025-11-24T22:00:00Z"), new Date("2025-12-24T22:00:00Z")];
  assert.equal(usualDueDay(stored), 25);
  assert.equal(usualDueDay([]), undefined);
});

const debt = (overrides: Partial<PlanDebt> = {}): PlanDebt => ({
  debtId: 1,
  creditor: "Store card",
  balance: 20000,
  interestRate: 22,
  minimumPayment: 1000,
  dueDay: 3,
  ...overrides
});

test("a debit order before payday can put the account under even when the month balances", () => {
  // Income 10 000 covers 1 000 debt + 8 000 living costs, so the month balances on paper. Start on
  // 26 September with R3 000: five days of spending (R266.67 a day) leave R1 666.67 on the 30th,
  // two October days (R258.06 a day) leave R1 150.54 — and the R1 000 debit order on 3 October,
  // with that day's spending, takes it to −R107.53. Pay does not arrive until Friday 23 October.
  const forecast = forecastCashflow({
    today: day(2026, 9, 26),
    openingBalance: 3000,
    payday: 25,
    monthlyIncome: 10000,
    essentials: [{ category: "groceries", amount: 8000 }],
    debts: [debt()],
    monthsAhead: 1
  });

  assert.ok(forecast.firstShort, "the account should run short before payday");
  assert.ok(same(forecast.firstShort.date, day(2026, 10, 3)), `ran short on ${forecast.firstShort.date.toDateString()}`);
  assert.ok(Math.abs(forecast.firstShort.balance - -107.53) < 0.02, String(forecast.firstShort.balance));
  assert.equal(forecast.firstShort.daysToPayday, 20);
  // 25 October 2026 is a Sunday, so pay lands on Friday 23 October.
  assert.ok(forecast.paydays.some((payday) => same(payday, day(2026, 10, 23))));
  const debitDay = forecast.days.find((d) => same(d.date, day(2026, 10, 3)))!;
  assert.deepEqual(debitDay.events.map((e) => [e.label, e.amount]), [["Store card", -1000]]);
});

test("every month reconciles: opening plus money in, less money out, is the closing balance", () => {
  const forecast = forecastCashflow({
    today: day(2026, 9, 27),
    openingBalance: 4000,
    payday: 25,
    monthlyIncome: 30000,
    essentials: [
      { category: "housing", amount: 8000 },
      { category: "groceries", amount: 5000 },
      { category: "transport", amount: 2000 }
    ],
    debts: [debt(), debt({ debtId: 2, creditor: "Car", balance: 150000, interestRate: 12, minimumPayment: 3500, dueDay: 25 })]
  });

  let opening = 4000;
  for (const month of forecast.months) {
    assert.ok(Math.abs(opening + month.moneyIn - month.moneyOut - month.closing) < 0.01, month.label);
    opening = month.closing;
  }
  assert.deepEqual(
    forecast.months.map((m) => m.label),
    ["September 2026", "October 2026", "November 2026", "December 2026"],
    "the rest of this month and the next three"
  );
});

test("day-to-day spending over a full month adds up to the monthly figure", () => {
  const forecast = forecastCashflow({
    today: day(2026, 11, 1),
    openingBalance: 0,
    payday: 25,
    monthlyIncome: 0,
    essentials: [{ category: "groceries", amount: 3000 }],
    debts: [],
    monthsAhead: 0
  });
  assert.equal(forecast.months[0].moneyOut, 3000);
  assert.equal(forecast.days.at(-1)?.balance, -3000);
});

test("a debt paid off inside the window stops being debited", () => {
  const forecast = forecastCashflow({
    today: day(2026, 10, 1),
    openingBalance: 10000,
    payday: 25,
    monthlyIncome: 0,
    essentials: [],
    debts: [debt({ balance: 1500, interestRate: 0, minimumPayment: 1000 })],
    monthsAhead: 2
  });
  const debits = forecast.days.flatMap((d) => d.events.filter((e) => e.kind === "debt").map((e) => e.amount));
  assert.deepEqual(debits, [-1000, -500], "R1 000, then the R500 that is left, then nothing");
});

test("a healthy month is reported as never going short, with its lowest point", () => {
  const forecast = forecastCashflow({
    today: day(2026, 9, 27),
    openingBalance: 20000,
    payday: 25,
    monthlyIncome: 30000,
    essentials: [{ category: "groceries", amount: 5000 }],
    debts: [debt()]
  });
  assert.equal(forecast.firstShort, null);
  assert.ok(forecast.lowest.balance > 0);
  assert.ok(forecast.months.every((m) => !m.runsShort));
});

test("debts with no payment history are assumed on the 1st, and it says so", () => {
  const forecast = forecastCashflow({
    today: day(2026, 9, 27),
    openingBalance: 5000,
    payday: 25,
    monthlyIncome: 20000,
    essentials: [],
    debts: [debt({ dueDay: undefined, creditor: "New loan" })]
  });
  assert.ok(forecast.assumptions.some((line) => /No payment history for New loan/.test(line)));
  assert.ok(forecast.days.find((d) => same(d.date, day(2026, 10, 1)))!.events.some((e) => e.label === "New loan"));
});
