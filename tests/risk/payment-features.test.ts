import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NEVER_MISSED_MONTHS,
  buildPaymentFeatures,
  type DebtRow,
  type PaymentRow
} from "../../lib/microservices/payment-features";

// These definitions must stay identical to ml-service/ml/payment/dataset.py. The model was fitted
// on those, so a mismatch here degrades predictions silently instead of failing.

const NOW = new Date("2026-09-23T00:00:00Z");
const MONTH = 1000 * 60 * 60 * 24 * 30.44;

function payments(outcomes: boolean[], debtId = 1): PaymentRow[] {
  return outcomes.map((missed, index) => ({
    debtId,
    dueDate: new Date(NOW.getTime() - (outcomes.length - index) * MONTH),
    missed
  }));
}

const debt = (overrides: Partial<DebtRow> = {}): DebtRow => ({
  debtId: 1,
  creditorName: "FNB",
  status: "Active",
  interestRate: 9.5,
  balance: 100000,
  ...overrides
});

test("miss rate and streak are measured across the whole history", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, true, false, true, true]),
    debts: [debt()],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const features = result.debts[0];
  assert.equal(features.prior_payment_count, 5);
  assert.equal(features.prior_miss_rate, 0.6);
  assert.equal(features.current_miss_streak, 2, "two misses at the end of the history");
});

test("a paid payment resets the streak", () => {
  const result = buildPaymentFeatures({
    payments: payments([true, true, true, false]),
    debts: [debt()],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok && result.debts[0].current_miss_streak, 0);
});

test("never having missed uses the documented sentinel, not zero", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [debt()],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok && result.debts[0].months_since_last_miss, NEVER_MISSED_MONTHS);
});

test("recent window looks at the last six payments only", () => {
  // Eight payments: the first two missed, the last six paid.
  const result = buildPaymentFeatures({
    payments: payments([true, true, false, false, false, false, false, false]),
    debts: [debt()],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.debts[0].recent6_miss_rate, 0);
  assert.equal(result.debts[0].prior_miss_rate, 0.25);
});

test("ratios are taken against monthly income", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [debt({ balance: 60000 }), debt({ debtId: 2, balance: 40000 })],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.debts[0].debt_balance_to_income, 3);
  assert.equal(result.debts[0].total_balance_to_income, 5);
});

test("a garnished debt is still scored — it is the riskiest, not an exclusion", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [debt({ balance: 60000 }), debt({ debtId: 2, status: "Garnished", balance: 40000 })],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.debts.length, 2, "both debts still have payments falling due");
  assert.equal(result.debts[0].active_debt_count, 1, "only the Active one counts towards the feature");
  assert.equal(result.debts[1].debt_status, "Garnished", "status reaches the model as a feature");
  assert.equal(result.debts[0].total_balance_to_income, 5);
});

test("an unrecognised status counts as inactive, never mapped to Active", () => {
  // toDebtStatus() maps values it does not know to ACTIVE; this count must not inherit that.
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [debt({ status: "Written off" })],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.debts[0].active_debt_count, 0);
  assert.equal(result.debts[0].debt_status, "Written off");
});

test("too little history is reported, never guessed at", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false]),
    debts: [debt()],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "NOT_ENOUGH_HISTORY");
});

test("no debts at all means there is nothing to score", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [],
    monthlyIncome: 20000,
    now: NOW
  });
  assert.equal(result.ok === false && result.reason, "NO_DEBTS");
});

test("zero income is refused rather than dividing by zero", () => {
  const result = buildPaymentFeatures({
    payments: payments([false, false, false, false]),
    debts: [debt()],
    monthlyIncome: 0,
    now: NOW
  });
  assert.equal(result.ok === false && result.reason, "NO_INCOME");
});
