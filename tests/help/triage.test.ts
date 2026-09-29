import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { resetModelPause } from "../../lib/ai/model";
import { triageByKeywords, triageRequest } from "../../lib/help/triage";

const saved = process.env.OPENAI_API_KEY;
afterEach(() => {
  resetModelPause();
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

test("a summons goes to a legal advisor, whatever else the message says", () => {
  const triage = triageByKeywords("I can't afford my repayments and now I got a summons from the bank");
  assert.equal(triage.assistanceType, "LEGAL_ADVISOR");
  assert.match(triage.reasons[0], /summons/);
});

test("arrears and debt review go to a debt counsellor, with the reasons", () => {
  const triage = triageByKeywords("I'm three months in arrears and thinking about debt review");
  assert.equal(triage.assistanceType, "DEBT_COUNSELLOR");
  assert.equal(triage.confidence, "clear");
  assert.equal(triage.reasons.length, 2);
});

test("budgeting and saving go to a financial advisor", () => {
  assert.equal(triageByKeywords("I want to budget better and start saving for my kids").assistanceType, "FINANCIAL_ADVISOR");
});

test("with nothing to go on, no advisor is guessed", () => {
  const triage = triageByKeywords("Hello, please call me");
  assert.equal(triage.assistanceType, null);
  assert.equal(triage.confidence, "unclear");
});

const modelSays = (assistanceType: string, reason: string): typeof fetch =>
  (async () =>
    new Response(JSON.stringify({ output_text: JSON.stringify({ assistanceType, reason }) }), { status: 200 })) as typeof fetch;

test("the model's reading is used when it has one", async () => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  const triage = await triageRequest("My salary is not enough for everything I owe each month", modelSays("DEBT_COUNSELLOR", "you owe more each month than you earn"));
  assert.equal(triage.source, "model");
  assert.equal(triage.assistanceType, "DEBT_COUNSELLOR");
});

test("a legal signal outranks the model", async () => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  const triage = await triageRequest("The sheriff came to attach my furniture this morning", modelSays("FINANCIAL_ADVISOR", "you want budgeting help"));
  assert.equal(triage.assistanceType, "LEGAL_ADVISOR");
  assert.equal(triage.source, "keywords");
});
