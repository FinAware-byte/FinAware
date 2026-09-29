import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resetModelPause } from "../../lib/ai/model";
import { draftLetter, polishLetter, prescriptionCheck, suggestedInstalment, type LetterFacts } from "../../lib/letters/draft";

const plain = (text: string) => text.replace(/ /g, " ");

const facts = (overrides: Partial<LetterFacts> = {}): LetterFacts => ({
  fullName: "Thandi Mokoena",
  creditorName: "Edgars",
  debtType: "Store Card",
  balance: 12000,
  currentInstalment: 900,
  lastPaidOn: new Date(2026, 7, 25),
  today: new Date(2026, 8, 27),
  ...overrides
});

test("when short, the offer is a fair share of what is available, in proportion to each instalment", () => {
  // R6 000 available for R9 000 of instalments; this account is R900 of them (10%) → R600.
  const offer = suggestedInstalment({ available: 6000, totalInstalments: 9000, thisInstalment: 900 });
  assert.equal(offer.amount, 600);
  assert.match(offer.reason, /10% of it to this account/);
  // With enough to cover everything, there is nothing to ask for.
  assert.equal(suggestedInstalment({ available: 10000, totalInstalments: 9000, thisInstalment: 900 }).amount, 900);
});

test("the arrangement letter names the real figures and asks for written confirmation", () => {
  const letter = draftLetter("arrangement", facts(), {
    arrangement: { proposed: 600, startDate: new Date(2026, 9, 25), circumstances: "My hours at work were cut in August." }
  });
  const body = plain(letter.body);
  assert.match(body, /about R 12 000,00 is outstanding and the instalment is R 900,00 a month/);
  assert.match(body, /R 600,00 a month, starting on 25 Oct 2026/);
  assert.match(body, /My hours at work were cut in August\./);
  assert.match(body, /confirm in writing/);
  assert.equal(letter.blocked, null);
});

test("a debt paid within three years has not prescribed, and the notice is blocked", () => {
  const letter = draftLetter("prescription", facts({ lastPaidOn: new Date(2026, 7, 25) }));
  assert.ok(letter.blocked);
  assert.match(letter.blocked!, /has not prescribed/);
});

test("a debt last paid more than three years ago can be sent the notice, which never acknowledges it", () => {
  assert.equal(prescriptionCheck(new Date(2023, 5, 1), new Date(2026, 8, 27)).prescribed, true);
  const letter = draftLetter("prescription", facts({ lastPaidOn: new Date(2023, 5, 1) }));
  assert.equal(letter.blocked, null);
  assert.match(letter.body, /Section 126B of the National Credit Act/);
  assert.match(letter.body, /Nothing in this letter is an acknowledgement of any debt/);
  assert.doesNotMatch(letter.body, /\bI owe\b|\bI acknowledge\b|\bI admit\b/i);
  assert.doesNotMatch(letter.body, /R\s?\d/, "no amount — naming one could read as acknowledging it");
});

test("with no payment history, prescription cannot be confirmed and the letter says so", () => {
  const check = prescriptionCheck(null, new Date(2026, 8, 27));
  assert.equal(check.prescribed, false);
  assert.match(check.reason, /Confirm the last payment date from a statement/);
});

test("the debt review letter is a courtesy note and says the formal notice comes from the counsellor", () => {
  const letter = draftLetter("debt_review", facts(), {
    debtReview: { counsellorName: "Sizwe Debt Counselling", counsellorNcr: "NCRDC1234", appliedOn: new Date(2026, 8, 20) }
  });
  assert.match(letter.body, /Sizwe Debt Counselling \(registration NCRDC1234\)/);
  assert.ok(letter.cautions.some((line) => /Form 17\.1/.test(line)));
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

const rewritten = (text: string): typeof fetch =>
  (async () => new Response(JSON.stringify({ output_text: JSON.stringify({ letter: text }) }), { status: 200 })) as typeof fetch;

test("a prescription notice is never sent to the model", async () => {
  let called = false;
  const letter = draftLetter("prescription", facts({ lastPaidOn: new Date(2023, 5, 1) }));
  const polished = await polishLetter(letter, (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch);
  assert.equal(called, false);
  assert.equal(polished.body, letter.body);
});

test("a polished letter that changes an amount or drops a placeholder is rejected", async () => {
  const letter = draftLetter("arrangement", facts(), { arrangement: { proposed: 600, startDate: new Date(2026, 9, 25), circumstances: "" } });
  const changedAmount = await polishLetter(letter, rewritten(letter.body.replace(/R\s600,00/, "R 500,00")));
  assert.equal(changedAmount.source, "template");
  const droppedPlaceholder = await polishLetter(letter, rewritten(letter.body.replace("[Your address]", "")));
  assert.equal(droppedPlaceholder.source, "template");
  const faithful = await polishLetter(letter, rewritten(letter.body.replace("I am writing about", "I write regarding")));
  assert.equal(faithful.source, "model");
});
