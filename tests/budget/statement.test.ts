import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  categorise,
  monthsCovered,
  parseDate,
  parseMoney,
  parseStatementCsv,
  summariseStatement,
  type CategorisedTransaction
} from "../../lib/budget/statement";

const categorised = (csv: string): CategorisedTransaction[] =>
  parseStatementCsv(csv).transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) }));

test("amounts are read in every format banks print them", () => {
  const cases: Array<[string, number]> = [
    ["-1234.56", -1234.56],
    ["1,234.56", 1234.56],
    ["-1 234,56", -1234.56],
    ["R 2 500.00", 2500],
    ["(450.00)", -450],
    ["450.00 DR", -450],
    ["450.00 CR", 450],
    ["12000", 12000]
  ];
  for (const [raw, expected] of cases) assert.equal(parseMoney(raw), expected, raw);
  assert.equal(parseMoney(""), null);
  assert.equal(parseMoney("Opening balance"), null);
});

test("dates are read day-first, as South African banks print them", () => {
  assert.deepEqual(parseDate("2026/08/03"), new Date(2026, 7, 3));
  assert.deepEqual(parseDate("03/08/2026"), new Date(2026, 7, 3), "3 August, not 8 March");
  assert.deepEqual(parseDate("20260803"), new Date(2026, 7, 3));
  assert.deepEqual(parseDate("3 Aug 2026"), new Date(2026, 7, 3));
  assert.equal(parseDate("Balance brought forward"), null);
});

test("an FNB-style export: account lines above the table, amount before description", () => {
  const csv = [
    "ACCOUNT TRANSACTIONS",
    "Account,Gold Cheque,62000000000",
    "Date,Amount,Balance,Description",
    "2026/08/01,25000.00,25400.00,SALARY ACME HOLDINGS",
    "2026/08/02,-6500.00,18900.00,RENT AUGUST MR NDLOVU",
    '2026/08/05,-1234.50,17665.50,"CHECKERS HYPER, MIDRAND"',
    "2026/08/09,-650.00,17015.50,ENGEN GARAGE N1",
    "2026/08/15,-2538.35,14477.15,WESBANK VEHICLE FIN",
    "2026/08/20,-199.00,14278.15,NETFLIX.COM",
    "2026/08/31,-65.00,14213.15,MONTHLY ACCOUNT FEE"
  ].join("\n");

  const transactions = categorised(csv);
  assert.equal(transactions.length, 7);
  const by = (text: string) => transactions.find((t) => t.description.includes(text))!;
  assert.equal(by("SALARY").category, "income");
  assert.equal(by("RENT").category, "housing");
  assert.equal(by("CHECKERS").category, "groceries");
  assert.equal(by("CHECKERS").description, "CHECKERS HYPER, MIDRAND", "a quoted comma stays inside the field");
  assert.equal(by("ENGEN").category, "transport");
  assert.equal(by("WESBANK").category, "debt", "a debt repayment is not an essential — it is already on the Debts page");
  assert.equal(by("NETFLIX").category, "discretionary");
  assert.equal(by("ACCOUNT FEE").category, "fees");
});

test("a Capitec-style export with separate money in and money out columns", () => {
  const csv = [
    "Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance",
    "1,1234567890,2026-08-01,2026-08-01,Salary,SALARY ACME,Income,Salary,18000.00,,,18200.00",
    "2,1234567890,2026-08-03,2026-08-03,Shoprite,SHOPRITE SOWETO,Groceries,Groceries,,-980.40,,17219.60",
    "3,1234567890,2026-08-04,2026-08-04,Prepaid Electricity,ESKOM PREPAID,Utilities,Electricity,,350.00,,16869.60"
  ].join("\n");

  const transactions = categorised(csv);
  assert.equal(transactions.length, 3);
  assert.equal(transactions[1].amount, -980.4);
  assert.equal(transactions[2].amount, -350, "money out printed as positive is still money out");
  assert.equal(transactions[2].category, "utilities");
});

test("semicolon-separated exports with comma decimals", () => {
  const csv = ["Date;Description;Amount;Balance", "03/08/2026;PICK N PAY FAMILY;-812,35;4 187,65"].join("\n");
  const [t] = categorised(csv);
  assert.equal(t.amount, -812.35);
  assert.equal(t.category, "groceries");
});

test("keywords match whole words only", () => {
  assert.equal(categorise("TRANSFER FROM CURRENT ACC", -500).category, "transfer");
  assert.equal(categorise("PARENT TEACHER ASSOC", -200).category, "unsorted", "PARENT is not rent");
  assert.equal(categorise("V&A WATERFRONT PARKING", -40).category, "transport", "WATERFRONT is not water");
  assert.equal(categorise("SUPERSPAR NORTHCLIFF", -600).category, "groceries");
});

test("spending that is not recognised is left out, visibly, rather than counted as an essential", () => {
  const [t] = categorised(["Date,Description,Amount", "2026/08/05,MAGIC MIKES TRADING,-420.00"].join("\n"));
  assert.equal(t.category, "unsorted");
  const summary = summariseStatement([t])!;
  assert.equal(summary.essentialsTotal, 0);
  assert.equal(summary.uncategorised, 1);
  assert.equal(summary.leftOut[0].category, "unsorted");
});

test("monthly figures are averaged over the months the statement covers", () => {
  assert.equal(monthsCovered(new Date(2026, 7, 1), new Date(2026, 7, 31)), 1);
  assert.equal(monthsCovered(new Date(2026, 6, 1), new Date(2026, 7, 31)), 2);
  // Pay-cycle statements: 25 July to 24 August is one month, not two calendar months.
  assert.equal(monthsCovered(new Date(2026, 6, 25), new Date(2026, 7, 24)), 1);

  const csv = [
    "Date,Description,Amount",
    "2026/07/01,RENT JULY,-6000.00",
    "2026/07/10,CHECKERS,-2000.00",
    "2026/08/01,RENT AUGUST,-6000.00",
    "2026/08/31,CHECKERS,-3000.00"
  ].join("\n");
  const summary = summariseStatement(categorised(csv))!;
  assert.equal(summary.months, 2);
  assert.equal(summary.essentials.housing, 6000);
  assert.equal(summary.essentials.groceries, 2500);
  assert.equal(summary.essentialsTotal, 8500);
});

test("a file with no recognisable table says so instead of returning nothing", () => {
  const result = parseStatementCsv("hello,world\n1,2");
  assert.equal(result.transactions.length, 0);
  assert.match(result.error ?? "", /No header row/);
});

test("the sample statement shipped for the demo reads cleanly", () => {
  const csv = readFileSync(new URL("../../public/samples/sample-statement.csv", import.meta.url), "utf8");
  const parsed = parseStatementCsv(csv);
  assert.equal(parsed.error, null);
  assert.equal(parsed.skipped, 0);
  const summary = summariseStatement(parsed.transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) })))!;
  assert.equal(summary.months, 4, "1 June to 26 September");
  assert.ok(summary.essentialsTotal > 0);
  assert.ok(summary.leftOut.some((item) => item.category === "debt"), "the sample includes a debt repayment to leave out");
});
