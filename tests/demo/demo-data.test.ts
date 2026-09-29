import assert from "node:assert/strict";
import { test } from "node:test";
import { findSpendingAnomalies } from "../../lib/budget/anomalies";
import { categorise, parseStatementCsv, summariseStatement } from "../../lib/budget/statement";
import { isValidSouthAfricanId } from "../../lib/identification/rules";
import { annualTax, buildPayslip, statementCsv, statementLines, type PersonFacts } from "../../prisma/demo/documents";
import { PERSONAS, essentialsTotal } from "../../prisma/demo/personas";

// Facts as the seed creates them (checked against the database on 2026-09-29).
const FACTS: Record<string, PersonFacts> = {
  "boitumelo-maseko": {
    name: "Boitumelo", surname: "Maseko", idNumber: "8005258445999", age: 43, monthlyIncome: 22039,
    debts: [
      { creditor: "African Bank", type: "Personal Loan", monthly: 1367, status: "Re-considered", dueDay: 25 },
      { creditor: "Capitec", type: "Credit Card", monthly: 2366, status: "Re-considered", dueDay: 25 },
      { creditor: "Toyota Financial Services", type: "Vehicle Finance", monthly: 9238, status: "Active", dueDay: 25 },
      { creditor: "Telkom", type: "Telecom Arrears", monthly: 350, status: "Active", dueDay: 25 },
      { creditor: "Capitec", type: "Personal Loan", monthly: 3119, status: "Active", dueDay: 25 },
      { creditor: "Netcare", type: "Medical Account", monthly: 1498, status: "Garnished", dueDay: 25 },
      { creditor: "Funeral Policy", type: "Funeral Policy", monthly: 350, status: "Re-considered", dueDay: 25 }
    ]
  },
  "chantelle-naidoo": {
    name: "Chantelle", surname: "Naidoo", idNumber: "8611279795187", age: 31, monthlyIncome: 51690,
    debts: [
      { creditor: "Standard Bank", type: "Credit Card", monthly: 2021, status: "Active", dueDay: 25 },
      { creditor: "FNB", type: "Credit Card", monthly: 640, status: "Active", dueDay: 25 },
      { creditor: "Nedbank", type: "Credit Card", monthly: 3115, status: "Active", dueDay: 25 }
    ]
  },
  "lebo-matlala": {
    name: "Lebo", surname: "Matlala", idNumber: "7506247168999", age: 33, monthlyIncome: 6950,
    debts: [
      { creditor: "Old Mutual Finance", type: "Personal Loan", monthly: 5484, status: "Re-considered", dueDay: 25 },
      { creditor: "Nedbank", type: "Credit Card", monthly: 2240, status: "Garnished", dueDay: 25 },
      { creditor: "ABSA", type: "Personal Loan", monthly: 855, status: "Active", dueDay: 25 },
      { creditor: "Woolworths", type: "Store Card", monthly: 350, status: "Re-considered", dueDay: 25 },
      { creditor: "Edgars", type: "Store Card", monthly: 350, status: "Active", dueDay: 25 }
    ]
  },
  "ayanda-dlamini": {
    name: "Ayanda", surname: "Dlamini", idNumber: "7007237277999", age: 42, monthlyIncome: 23582,
    debts: [
      { creditor: "African Bank", type: "Personal Loan", monthly: 2519, status: "Garnished", dueDay: 25 },
      { creditor: "Capitec", type: "Credit Card", monthly: 439, status: "Active", dueDay: 25 },
      { creditor: "WesBank", type: "Vehicle Finance", monthly: 8471, status: "Garnished", dueDay: 25 },
      { creditor: "MTN", type: "Telecom Arrears", monthly: 350, status: "Active", dueDay: 25 }
    ]
  },
  "pieter-van-wyk": {
    name: "Pieter", surname: "Van Wyk", idNumber: "7312147516555", age: 33, monthlyIncome: 58520,
    debts: [
      { creditor: "Nedbank", type: "Business Loan", monthly: 3756, status: "Active", dueDay: 25 },
      { creditor: "Standard Bank", type: "Overdraft", monthly: 2827, status: "Active", dueDay: 25 }
    ]
  },
  "zanele-mkhize": {
    name: "Zanele", surname: "Mkhize", idNumber: "7312147390555", age: 66, monthlyIncome: 14557,
    debts: [
      { creditor: "Maintenance Order (Family Court)", type: "Child Maintenance", monthly: 461, status: "Active", dueDay: 25 },
      { creditor: "Ackermans", type: "Store Card", monthly: 350, status: "Garnished", dueDay: 25 }
    ]
  }
};
const persona = (slug: string) => PERSONAS.find((p) => p.slug === slug)!;

test("every persona is a valid seeded ID, and its essentials add up to its living costs", () => {
  assert.equal(new Set(PERSONAS.map((p) => p.slug)).size, PERSONAS.length);
  for (const p of PERSONAS) {
    assert.ok(isValidSouthAfricanId(p.idNumber), `${p.slug}: ${p.idNumber} is not a valid SA ID`);
    assert.equal(essentialsTotal(p), p.monthlyExpenses, `${p.slug}: essentials must add up to the profile's living costs`);
  }
});

test("income tax follows the SARS 2025/26 tables, with the age rebates", () => {
  // R300 000: R42 678 + 26% of the R62 900 above R237 100 = R59 032, less the R17 235 rebate.
  assert.equal(annualTax(300_000, 40), 41_797);
  assert.equal(annualTax(300_000, 66), 41_797 - 9_444, "the secondary rebate from 65");
  assert.equal(annualTax(90_000, 30), 0, "below the tax threshold");
});

test("a payslip's net pay is exactly the take-home income the app holds", () => {
  for (const slug of ["boitumelo-maseko", "chantelle-naidoo", "ayanda-dlamini", "zanele-mkhize"]) {
    const slip = buildPayslip(persona(slug), FACTS[slug])!;
    assert.ok(Math.abs(slip.net - FACTS[slug].monthlyIncome) <= 0.01, `${slug}: net ${slip.net} vs income ${FACTS[slug].monthlyIncome}`);
    const deducted = slip.deductions.reduce((sum, d) => sum + d.amount, 0);
    assert.ok(Math.abs(slip.gross - deducted - slip.net) < 0.011, `${slug}: gross less deductions must be net`);
    assert.ok(slip.deductions.find((d) => d.label === "UIF")!.amount <= 177.12, "UIF is capped");
  }
});

test("garnishee orders are payslip deductions, never debit orders on the statement", () => {
  const slip = buildPayslip(persona("ayanda-dlamini"), FACTS["ayanda-dlamini"])!;
  const orders = slip.deductions.filter((d) => /Emoluments attachment order/.test(d.label)).map((d) => d.label);
  assert.deepEqual(orders, ["Emoluments attachment order: African Bank", "Emoluments attachment order: WesBank"]);

  const lines = statementLines(persona("ayanda-dlamini"), FACTS["ayanda-dlamini"]);
  assert.equal(lines.some((l) => /AFRICAN BANK|WESBANK/.test(l.description)), false);
  assert.ok(lines.some((l) => /CAPITEC CREDIT CARD PAYMENT/.test(l.description)), "the ungarnished card is still a debit order");
});

test("the self-employed and unemployed have no payslip", () => {
  assert.equal(buildPayslip(persona("lebo-matlala"), FACTS["lebo-matlala"]), null);
  assert.equal(buildPayslip(persona("pieter-van-wyk"), FACTS["pieter-van-wyk"]), null);
});

test("every statement format reads cleanly with the app's own importer", () => {
  for (const slug of ["boitumelo-maseko", "ayanda-dlamini", "pieter-van-wyk", "zanele-mkhize"]) {
    const parsed = parseStatementCsv(statementCsv(persona(slug), FACTS[slug]));
    assert.equal(parsed.error, null, slug);
    assert.equal(parsed.skipped, 0, `${slug}: rows skipped`);
    assert.equal(parsed.transactions.length, statementLines(persona(slug), FACTS[slug]).length, slug);
  }
});

test("importing a persona's statement gives back roughly their saved Money Plan", () => {
  for (const slug of ["boitumelo-maseko", "chantelle-naidoo", "zanele-mkhize"]) {
    const p = persona(slug);
    const parsed = parseStatementCsv(statementCsv(p, FACTS[slug]));
    const summary = summariseStatement(parsed.transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) })))!;
    for (const category of ["housing", "groceries", "transport", "utilities", "education", "childcare", "insurance"] as const) {
      const planned = p.essentials[category];
      if (!planned) continue;
      const imported = summary.essentials[category];
      assert.ok(Math.abs(imported - planned) / planned < 0.12, `${slug} ${category}: imported ${imported} vs planned ${planned}`);
    }
  }
});

test("a stretched account bounces debit orders; a comfortable one never does", () => {
  const bounced = (slug: string) => statementLines(persona(slug), FACTS[slug]).filter((l) => /DISHONOURED DEBIT ORDER/.test(l.description)).length;
  assert.ok(bounced("lebo-matlala") > 0, "Lebo's income cannot cover every debit order");
  assert.equal(bounced("chantelle-naidoo"), 0);
});

test("the planted unusual spending in September is what the anomaly alerts find", () => {
  const report = (slug: string) =>
    findSpendingAnomalies(
      parseStatementCsv(statementCsv(persona(slug), FACTS[slug])).transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) }))
    );
  const boitumelo = report("boitumelo-maseko");
  assert.equal(boitumelo.month, "September 2026");
  assert.ok(boitumelo.anomalies.some((a) => a.label === "New payee: QUICKCASH LOANS"), "the new short-term loan");
  assert.ok(boitumelo.anomalies.some((a) => a.category === "discretionary"), "the betting");

  const chantelle = report("chantelle-naidoo");
  assert.deepEqual(chantelle.anomalies.filter((a) => a.kind !== "new_payee"), [], "an ordinary month raises no alarm");
});

test("no statement starts overdrawn before its first money in", () => {
  for (const slug of Object.keys(FACTS)) {
    const lines = statementLines(persona(slug), FACTS[slug]);
    const firstIncome = lines.findIndex((l) => l.amount > 0);
    const beforePay = lines.slice(0, firstIncome);
    assert.ok(beforePay.every((l) => l.balance >= 0), `${slug} goes below zero before its first pay`);
  }
});
