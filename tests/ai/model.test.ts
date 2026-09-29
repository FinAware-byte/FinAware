import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { askModel, figuresAllowed, randAmounts, resetModelPause } from "../../lib/ai/model";

// The API is never called: every test hands askModel a fake fetch.
const saved = process.env.OPENAI_API_KEY;
beforeEach(() => {
  process.env.OPENAI_API_KEY = "test-key-not-real";
  resetModelPause();
});
afterEach(() => {
  if (saved === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = saved;
});

const reply = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as typeof fetch;

const request = (fetchImpl: typeof fetch) => ({
  task: "test",
  system: "s",
  user: "u",
  schema: { name: "x", schema: { type: "object" } },
  validate: (value: unknown) => ((value as { answer?: unknown }).answer === "yes" ? (value as { answer: string }) : null),
  fetchImpl
});

test("a valid, schema-passing reply is returned with the model's name", async () => {
  const result = await askModel(request(reply(200, { output: [{ content: [{ text: '{"answer":"yes"}' }] }] })));
  assert.deepEqual(result.ok && result.value, { answer: "yes" });
});

test("no credit is a reason, not a crash", async () => {
  const result = await askModel(request(reply(429, { error: { type: "insufficient_quota", message: "..." } })));
  assert.equal(result.ok, false);
  assert.match(!result.ok ? result.reason : "", /429 \(insufficient_quota\)/);
});

test("after an out-of-credit answer, calls pause instead of waiting on the same refusal", async () => {
  let calls = 0;
  const noCredit = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: { type: "insufficient_quota" } }), { status: 429 });
  }) as typeof fetch;
  await askModel(request(noCredit));
  const second = await askModel(request(noCredit));
  assert.equal(calls, 1, "the second call never reached the API");
  assert.match(!second.ok ? second.reason : "", /not asking again/);
});

test("a timeout or a bad reply does not pause anything", async () => {
  await askModel(request(reply(500, {})));
  const next = await askModel(request(reply(200, { output_text: '{"answer":"yes"}' })));
  assert.equal(next.ok, true);
});

test("malformed JSON and answers that fail validation both fall back", async () => {
  const broken = await askModel(request(reply(200, { output_text: "not json" })));
  assert.equal(broken.ok, false);
  const wrong = await askModel(request(reply(200, { output_text: '{"answer":"no"}' })));
  assert.equal(wrong.ok, false);
});

test("without a key nothing is sent at all", async () => {
  delete process.env.OPENAI_API_KEY;
  let called = false;
  const result = await askModel(request((async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch));
  assert.equal(result.ok, false);
  assert.equal(called, false);
});

test("rand amounts are read however they are written", () => {
  assert.deepEqual(randAmounts("You pay R1 312,29 now and R 2,538.35 later, or R500."), [1312.29, 2538.35, 500]);
  assert.deepEqual(randAmounts("Nothing here costs money, not even 500."), []);
});

test("an answer may only quote money FinAware calculated", () => {
  const known = [1312.29, 2538.35];
  assert.equal(figuresAllowed("Interest is R1 312,29 this month.", known), true);
  assert.equal(figuresAllowed("Interest is about R1 312 this month.", known), true, "rounding a known figure is the same figure");
  assert.equal(figuresAllowed("You could save R4 000 a month.", known), false, "a figure the app never produced");
  assert.equal(figuresAllowed("Keep paying on time.", known), true, "no money, nothing to check");
});
