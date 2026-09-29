import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetModelPause } from "../../lib/ai/model";
import { buildCaseSummary, narrateCaseSummary, type CaseFacts } from "../../lib/help/case-summary";

const plain = (text: string) => text.replace(/ /g, " ");

const facts = (overrides: Partial<CaseFacts> = {}): CaseFacts => ({
  firstName: "Thandi",
  age: 38,
  employmentStatus: "EMPLOYED",
  monthlyIncome: 18000,
  monthlyExpenses: 11000,
  savings: 2000,
  creditScore: 541,
  debts: [
    { creditorName: "Edgars", debtTypeStored: "Store Card", balance: 12000, interestRate: 24, monthlyObligation: 900, status: "ACTIVE", missedPaymentsCount: 3, totalPaymentsCount: 12 },
    { creditorName: "African Bank", debtTypeStored: "Personal Loan", balance: 60000, interestRate: 27, monthlyObligation: 7200, status: "GARNISHED", missedPaymentsCount: 5, totalPaymentsCount: 12 }
  ],
  legalRecordTypes: ["Garnishee order", "Summons"],
  risk: { level: "High", score: 88.4, assessedAt: "2026-09-20T10:00:00Z", drivers: ["Savings coverage", "Debt-to-income ratio"] },
  debtReview: { verdict: "likely", headline: "You are likely to qualify for debt review", leftOver: -1100 },
  request: { assistanceType: "DEBT_COUNSELLOR", message: "I can't keep up and my salary is being garnished." },
  preparedAt: new Date(2026, 8, 27),
  ...overrides
});

test("matters with a deadline come first, the summons before everything", () => {
  const summary = buildCaseSummary(facts());
  assert.match(summary.urgent[0], /summons/i);
  assert.ok(summary.urgent.some((line) => /garnishee order.*African Bank/i.test(line)));
  assert.ok(summary.urgent.some((line) => /Short by R 1 100,00/.test(plain(line))));
  assert.ok(summary.urgent.some((line) => /8 missed payments/.test(line)));
});

test("the opening paragraph is worked out from the figures, and says the client is short", () => {
  const { narrative } = buildCaseSummary(facts());
  const text = plain(narrative);
  assert.match(text, /Thandi is 38, employed, with a take-home income of R 18 000,00 a month\./);
  assert.match(text, /2 accounts with R 72 000,00 outstanding cost R 8 100,00 a month, leaving the client R 1 100,00 short every month\./);
  assert.doesNotMatch(text, /\s{2}/, "no doubled spaces from joining sentences");
});

test("the plain-text version carries every account and the client's own words", () => {
  const { plainText } = buildCaseSummary(facts());
  assert.match(plainText, /NEEDS ATTENTION FIRST/);
  assert.match(plainText, /African Bank \(Personal Loan\)/);
  assert.match(plainText, /I can't keep up/);
});

test("with nothing urgent, nothing is invented to fill the section", () => {
  const summary = buildCaseSummary(
    facts({ legalRecordTypes: [], debts: [], debtReview: { verdict: "unlikely", headline: "You are unlikely to qualify", leftOver: 3000 } })
  );
  assert.deepEqual(summary.urgent, []);
  assert.doesNotMatch(summary.plainText, /NEEDS ATTENTION FIRST/);
});

const saved = process.env.OPENAI_API_KEY;
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  resetModelPause();
});
afterEach(() => {
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

const paragraph = (text: string): typeof fetch =>
  (async () => new Response(JSON.stringify({ output_text: JSON.stringify({ paragraph: text }) }), { status: 200 })) as typeof fetch;

test("a model paragraph that uses only the brief's figures replaces the calculated one", async () => {
  const summary = buildCaseSummary(facts());
  const written = await narrateCaseSummary(
    summary,
    paragraph("Thandi earns R18 000 a month and is R1 100 short after costs and repayments, with a garnishee order and a summons on record.")
  );
  assert.equal(written.narrativeSource, "model");
  assert.match(written.plainText, /Thandi earns R18 000/);
});

test("a model paragraph that invents an amount is thrown away", async () => {
  const summary = buildCaseSummary(facts());
  const written = await narrateCaseSummary(summary, paragraph("Thandi could clear everything with R2 500 a month more, which is well within reach."));
  assert.equal(written.narrativeSource, "calculated");
  assert.equal(written.narrative, summary.narrative);
});
