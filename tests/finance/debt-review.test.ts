import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyDebtType, screenDebtReview, type ScreenerDebt } from "../../lib/finance/debt-review";

const plain = (text: string) => text.replace(/ /g, " ");

const debt = (overrides: Partial<ScreenerDebt> = {}): ScreenerDebt => ({
  debtId: 1,
  creditorName: "Store card",
  debtTypeStored: "Store Card",
  balance: 20000,
  monthlyObligation: 1500,
  status: "ACTIVE",
  missedPaymentsCount: 0,
  totalPaymentsCount: 12,
  ...overrides
});

test("someone short every month after living costs is likely to qualify, with the shortfall in rands", () => {
  // 20 000 − 12 000 expenses − 9 500 repayments = −1 500.
  const screen = screenDebtReview({
    monthlyIncome: 20000,
    monthlyExpenses: 12000,
    debts: [debt({ monthlyObligation: 6000 }), debt({ debtId: 2, debtTypeStored: "Personal Loan", monthlyObligation: 3500 })],
    legalRecordTypes: []
  });

  assert.equal(screen.verdict, "likely");
  assert.equal(screen.leftOver, -1500);
  assert.match(plain(screen.summary), /R 1 500,00 short/);
  assert.equal(screen.working.at(-1)?.label, "= Short every month");
});

test("a comfortable surplus is told it does not need debt review", () => {
  const screen = screenDebtReview({
    monthlyIncome: 40000,
    monthlyExpenses: 15000,
    debts: [debt({ monthlyObligation: 3000 })],
    legalRecordTypes: []
  });
  assert.equal(screen.verdict, "unlikely");
  assert.match(screen.summary, /stop you taking new credit/, "the cost of debt review must be part of the answer");
});

test("payments debt review cannot touch still come off before the credit repayments", () => {
  // Maintenance and a funeral policy keep being paid in full; without them this user looks fine.
  const screen = screenDebtReview({
    monthlyIncome: 20000,
    monthlyExpenses: 10000,
    debts: [
      debt({ monthlyObligation: 6000 }),
      debt({ debtId: 2, creditorName: "Maintenance", debtTypeStored: "Child Maintenance", monthlyObligation: 2500 }),
      debt({ debtId: 3, creditorName: "Funeral cover", debtTypeStored: "Funeral Policy", monthlyObligation: 400 })
    ],
    legalRecordTypes: []
  });

  // 20 000 − 10 000 − 2 900 outside = 7 100 available; 7 100 − 6 000 = 1 100 left (5.5% of income).
  assert.equal(screen.leftOver, 1100);
  assert.equal(screen.verdict, "possible", "a 5.5% margin is thin enough to be worth a counsellor's look");
  assert.ok(screen.working.some((line) => line.label === "− Payments debt review cannot cover"));
  assert.deepEqual(
    screen.accounts.filter((a) => a.inclusion === "no").map((a) => a.type),
    ["Child Maintenance", "Funeral Policy"]
  );
});

test("missed payments make a modest surplus worth a counsellor's look", () => {
  const input = {
    monthlyIncome: 30000,
    monthlyExpenses: 18000,
    legalRecordTypes: [] as string[]
  };
  // 30 000 − 18 000 − 7 000 = 5 000 left, about 17% of income.
  const clean = screenDebtReview({ ...input, debts: [debt({ monthlyObligation: 7000 })] });
  const missing = screenDebtReview({ ...input, debts: [debt({ monthlyObligation: 7000, missedPaymentsCount: 3 })] });

  assert.equal(clean.verdict, "unlikely");
  assert.equal(missing.verdict, "possible", "the Act weighs repayment history, not only the sums");
  assert.match(missing.summary, /3 missed payments/);
});

test("no income is not suitable, whatever the debts", () => {
  const screen = screenDebtReview({ monthlyIncome: 0, monthlyExpenses: 5000, debts: [debt()], legalRecordTypes: [] });
  assert.equal(screen.verdict, "not_suitable");
});

test("without living costs the screen asks for them instead of guessing", () => {
  const screen = screenDebtReview({ monthlyIncome: 25000, monthlyExpenses: null, debts: [debt()], legalRecordTypes: [] });
  assert.equal(screen.verdict, "need_info");
  assert.equal(screen.leftOver, null);
});

test("legal steps already taken are flagged in words", () => {
  const screen = screenDebtReview({
    monthlyIncome: 20000,
    monthlyExpenses: 12000,
    debts: [debt({ monthlyObligation: 9000 })],
    legalRecordTypes: ["Summons", "Garnishee order", "Default listing dispute"]
  });
  assert.deepEqual(screen.legalFlags.map((f) => f.record), ["Summons", "Garnishee order"]);
  assert.match(screen.legalFlags[0].message, /timing matters/);
});

test("a garnished account stays in the sums but is not treated as simply restructurable", () => {
  const screen = screenDebtReview({
    monthlyIncome: 20000,
    monthlyExpenses: 12000,
    debts: [debt({ status: "GARNISHED", monthlyObligation: 4000 })],
    legalRecordTypes: []
  });
  assert.equal(screen.accounts[0].inclusion, "maybe");
  assert.match(screen.accounts[0].why, /garnishee order/i);
  assert.equal(screen.leftOver, 20000 - 12000 - 4000, "the deduction is real, so it is still counted");
});

test("only non-credit accounts means nothing to restructure", () => {
  const screen = screenDebtReview({
    monthlyIncome: 15000,
    monthlyExpenses: 12000,
    debts: [debt({ debtTypeStored: "Utility Arrears", monthlyObligation: 5000 })],
    legalRecordTypes: []
  });
  assert.equal(screen.verdict, "unlikely");
  assert.match(screen.headline, /Nothing here that debt review could restructure/);
});

test("every debt type in the demo data is classified deliberately, not by the fallback", () => {
  // The distinct Debts.debt_type values in the seeded database.
  const stored = [
    "Store Card", "Credit Card", "Vehicle Finance", "Personal Loan", "Utility Arrears", "Medical Account",
    "Overdraft", "Commercial Mortgage", "Telecom Arrears", "Business Loan", "Funeral Policy", "Mortgage",
    "Student Loan", "Child Maintenance", "Commercial Property Loan", "Informal Loan", "Acquisition Bridge Loan",
    "Bond", "Business Expansion Loan", "Commercial Property Facility", "Corporate Overdraft", "Equipment Finance",
    "Fleet Finance", "Home Loan", "Lombard Facility", "Working Capital Facility"
  ];
  for (const type of stored) {
    assert.doesNotMatch(classifyDebtType(type).why, /Not a type the screen recognises/, `${type} fell through`);
  }

  assert.equal(classifyDebtType("Bond").inclusion, "yes");
  assert.equal(classifyDebtType("Home Loan").inclusion, "yes");
  assert.equal(classifyDebtType("Funeral Policy").inclusion, "no");
  assert.equal(classifyDebtType("Commercial Mortgage").inclusion, "maybe", "business credit, not a personal bond");
  assert.equal(classifyDebtType("Corporate Overdraft").inclusion, "maybe");
  assert.equal(classifyDebtType("Medical Account").inclusion, "maybe", "incidental credit, not a plain credit account");
});
