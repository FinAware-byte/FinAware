import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { findSpendingAnomalies, payeeOf } from "../../lib/budget/anomalies";
import { categorise, parseStatementCsv, type CategorisedTransaction } from "../../lib/budget/statement";

const categorised = (rows: string[]): CategorisedTransaction[] =>
  parseStatementCsv(["Date,Description,Amount", ...rows].join("\n")).transactions.map((t) => ({
    ...t,
    ...categorise(t.description, t.amount)
  }));

// Three ordinary months: rent on the 1st, groceries through the month, a little betting.
const ordinary = (month: string) => [
  `2026/${month}/01,RENT ${month},-7000.00`,
  `2026/${month}/05,CHECKERS,-1500.00`,
  `2026/${month}/19,PICK N PAY,-1400.00`,
  `2026/${month}/25,BETWAY,-200.00`,
  `2026/${month}/30,MONTHLY ACCOUNT FEE,-69.00`
];

test("a month in progress is compared with the same days of earlier months — rent on the 1st is not an alarm", () => {
  // September to the 10th: rent (as usual) and one grocery shop (as usual). A linear projection
  // of R8 500 over 10 days would claim R25 500 for the month; like-for-like, nothing is unusual.
  const transactions = categorised([
    ...ordinary("06"), ...ordinary("07"), ...ordinary("08"),
    "2026/09/01,RENT 09,-7000.00",
    "2026/09/05,CHECKERS,-1500.00",
    "2026/09/10,SPAR,-50.00"
  ]);
  const report = findSpendingAnomalies(transactions);
  assert.equal(report.month, "September 2026");
  assert.equal(report.throughDay, 10);
  assert.equal(report.monthsCompared, 3);
  assert.deepEqual(report.anomalies, []);
});

test("spending well above the user's own usual is flagged, with the rands and what drove it", () => {
  const transactions = categorised([
    ...ordinary("06"), ...ordinary("07"), ...ordinary("08"),
    "2026/09/01,RENT 09,-7000.00",
    "2026/09/05,CHECKERS,-1500.00",
    "2026/09/08,BETWAY,-600.00",
    "2026/09/15,BETWAY,-900.00",
    "2026/09/20,BETWAY,-500.00"
  ]);
  const report = findSpendingAnomalies(transactions);
  const betting = report.anomalies.find((a) => a.category === "discretionary")!;
  assert.ok(betting, "the betting should be flagged");
  // By the 20th, earlier months had spent nothing on betting (it falls on the 25th).
  assert.equal(betting.usual, 0);
  assert.equal(betting.amount, 2000);
  assert.equal(betting.topTransactions[0].amount, 900, "the largest payment is listed first");
  // The extra is the betting itself. The net total is only R600 up, because this month's second
  // grocery shop has not happened yet — but it is still coming, so the net would understate it.
  assert.equal(report.extraThisMonth, 2000);
});

test("small swings are not alerts, however large in percentage", () => {
  const transactions = categorised([
    ...ordinary("06"), ...ordinary("07"), ...ordinary("08"),
    ...ordinary("09"),
    "2026/09/26,BETWAY,-250.00" // 450 instead of 200: more than double, but under R500 more
  ]);
  const report = findSpendingAnomalies(transactions);
  assert.equal(report.anomalies.filter((a) => a.kind === "category").length, 0);
});

test("a new payee is flagged, however the bank decorates its name", () => {
  assert.equal(payeeOf("POS PURCHASE ZAPPER CASH 4402*1234 15/09"), "ZAPPER CASH");
  assert.equal(payeeOf("ZAPPER CASH LOANS DEBIT ORDER"), "ZAPPER CASH");
  assert.equal(payeeOf("RENT SEPTEMBER LANDLORD M NDLOVU"), payeeOf("RENT JUNE LANDLORD M NDLOVU"), "the month is not the payee");

  const transactions = categorised([...ordinary("06"), ...ordinary("07"), ...ordinary("08"), "2026/09/03,RENT 09,-7000.00", "2026/09/15,ZAPPER CASH LOANS,-650.00"]);
  const report = findSpendingAnomalies(transactions);
  const fresh = report.anomalies.find((a) => a.kind === "new_payee");
  assert.equal(fresh?.label, "New payee: ZAPPER CASH");
  assert.equal(fresh?.amount, 650);
});

test("with fewer than two complete earlier months there is no pattern to break", () => {
  const report = findSpendingAnomalies(categorised([...ordinary("08"), "2026/09/05,BETWAY,-5000.00"]));
  assert.equal(report.enoughHistory, false);
  assert.deepEqual(report.anomalies, []);
});

test("the demo statement's unusual September is found — and nothing else", () => {
  const csv = readFileSync(new URL("../../public/samples/sample-statement.csv", import.meta.url), "utf8");
  const transactions = parseStatementCsv(csv).transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) }));
  const report = findSpendingAnomalies(transactions);

  assert.equal(report.month, "September 2026");
  assert.equal(report.throughDay, 25, "the last transaction on the statement");
  assert.equal(report.monthsCompared, 3);
  // Betting and the large online order; the new cash-lender debit, both as a new payee and in the
  // unrecognised spending it lands in. The total is up about 19%, just under the 20% bar.
  const found = report.anomalies.map((a) => a.label).sort();
  assert.deepEqual(found, ["New payee: ZAPPER CASH", "Not essential", "Not recognised"]);
  // The cash-lender debit is counted once, not once per alert.
  const notEssential = report.anomalies.find((a) => a.label === "Not essential")!;
  const unrecognised = report.anomalies.find((a) => a.label === "Not recognised")!;
  assert.ok(Math.abs(report.extraThisMonth - (notEssential.difference + unrecognised.difference)) < 0.01);
});

test("days are written as ordinals", async () => {
  const { ordinal } = await import("../../lib/format");
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 25, 31].map(ordinal), [
    "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "25th", "31st"
  ]);
});
