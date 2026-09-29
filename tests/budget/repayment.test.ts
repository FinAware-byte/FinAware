import assert from "node:assert/strict";
import { test } from "node:test";
import { amortisedPayment, monthlyPaymentFor, repaymentTerms } from "../../lib/finance/repayment";
import { simulatePayoff } from "../../lib/budget/plan";

test("a bond is repaid on the annuity formula, not as a share of the balance", () => {
  // R1 000 000 at 11% over 240 months. Textbook answer ≈ R10 321.88.
  const payment = amortisedPayment(1_000_000, 11, 240);
  assert.ok(Math.abs(payment - 10321.88) < 1, `expected about 10321.88, got ${payment}`);
});

test("an interest-free debt is simply spread across the term", () => {
  assert.equal(amortisedPayment(24000, 0, 24), 1000);
});

test("a shorter term costs more per month", () => {
  const twenty = amortisedPayment(1_000_000, 11, 240);
  const ten = amortisedPayment(1_000_000, 11, 120);
  assert.ok(ten > twenty);
});

test("the payment always exceeds the first month's interest, so the balance can fall", () => {
  const balance = 2_000_000;
  const rate = 9.04;
  const payment = amortisedPayment(balance, rate, 240);
  const firstMonthInterest = (balance * (rate / 100)) / 12;
  assert.ok(payment > firstMonthInterest, "otherwise the debt would never clear");
});

test("debt types map to the way that debt is actually repaid", () => {
  for (const type of ["Bond", "Home Loan", "Mortgage", "Commercial Property Loan"]) {
    assert.equal(repaymentTerms(type).shape, "amortising", type);
    assert.equal(repaymentTerms(type).termMonths, 240, type);
  }
  assert.equal(repaymentTerms("Vehicle Finance").termMonths, 72);
  assert.equal(repaymentTerms("Personal Loan").termMonths, 60);

  for (const type of ["Store Card", "Credit Card", "Overdraft", "Utility Arrears", "Funeral Policy"]) {
    assert.equal(repaymentTerms(type).shape, "revolving", type);
  }
});

test("an unknown debt type falls back to the existing estimate rather than guessing a term", () => {
  assert.equal(repaymentTerms("Something New").shape, "revolving");
  assert.equal(repaymentTerms(undefined).shape, "revolving");
});

test("a bond costs far less per month than the revolving estimate implied", () => {
  const bond = { balance: 2_007_106, interestRate: 9.04, debtType: "Bond" };
  const asAmortising = monthlyPaymentFor(bond);
  const asRevolving = monthlyPaymentFor({ ...bond, debtType: "Store Card" });

  assert.ok(asAmortising < asRevolving / 2, "the old estimate more than doubled a real bond payment");
  assert.ok(asAmortising > 17_000 && asAmortising < 19_000, `expected about R18 000, got ${asAmortising}`);
});

test("an explicit minimum still wins over anything inferred", () => {
  assert.equal(monthlyPaymentFor({ balance: 500_000, interestRate: 10, debtType: "Bond", minimumPayment: 4200 }), 4200);
});

test("a bond clears close to its stated term when only the instalment is paid", () => {
  const result = simulatePayoff([{ debtId: 1, creditor: "Bank", balance: 1_000_000, interestRate: 11, debtType: "Bond" }], 0);
  assert.ok(result.months !== null, "a bond on its instalment must clear");
  assert.ok(Math.abs(result.months! - 240) <= 2, `expected about 240 months, got ${result.months}`);
});

test("paying extra shortens the term without shrinking the instalment", () => {
  const debt = { debtId: 1, creditor: "Bank", balance: 1_000_000, interestRate: 11, debtType: "Bond" };
  const plain = simulatePayoff([debt], 0);
  const withExtra = simulatePayoff([debt], 3000);

  assert.ok(withExtra.months! < plain.months!, "extra payments shorten the loan");
  assert.ok(withExtra.interest < plain.interest, "and cut the interest");
});
