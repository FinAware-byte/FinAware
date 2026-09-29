import assert from "node:assert/strict";
import { test } from "node:test";
import type { CallJson } from "../../services/financial-api/src/assess";
import { getPeerSegment } from "../../services/financial-api/src/peer-segment";

const features = {
  monthly_income_zar: 30000, monthly_expenses_zar: 15000, savings_zar: 20000, credit_score: 640, has_loan: "Yes",
  loan_amount_zar: 50000, monthly_emi_zar: 3000, loan_interest_rate_pct: 18, age: 35, employment_status: "Employed"
};

function fake(routes: Record<string, { status: number; payload: unknown }>) {
  const calls: string[] = [];
  const callJson: CallJson = async (name, path, init) => {
    calls.push(`${name} ${init?.method ?? "GET"} ${path}`);
    const key = Object.keys(routes).find((prefix) => `${name} ${path}`.startsWith(prefix));
    return key ? routes[key] : { status: 500, payload: {} };
  };
  return { calls, callJson };
}

test("the profile's own features are sent to the ML service, and the answer is marked available", async () => {
  const { calls, callJson } = fake({
    "financial-data /financial-data/": { status: 200, payload: { profile: {}, features } },
    "ml /segment": { status: 200, payload: { segment: { name: "Lower income" } } }
  });
  const result = await getPeerSegment("7", callJson);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { available: true, segment: { name: "Lower income" } });
  assert.deepEqual(calls, ["financial-data GET /financial-data/7", "ml POST /segment"]);
});

test("no financial profile is not an error — there is simply nothing to compare yet", async () => {
  const { calls, callJson } = fake({ "financial-data /financial-data/": { status: 200, payload: { profile: null, features: null } } });
  const result = await getPeerSegment("7", callJson);
  assert.deepEqual(result, { status: 200, body: { available: false, reason: "PROFILE_REQUIRED" } });
  assert.equal(calls.length, 1, "the ML service is not called");
});

test("an unavailable model is reported as such, not as a crash", async () => {
  const { callJson } = fake({
    "financial-data /financial-data/": { status: 200, payload: { profile: {}, features } },
    "ml /segment": { status: 503, payload: { error: "MODEL_UNAVAILABLE" } }
  });
  assert.equal((await getPeerSegment("7", callJson)).status, 503);
});

test("positions are described in words, and never as a percentile outside the group's range", async () => {
  const { positionSentence, isFavourable, formatPeerValue } = await import("../../lib/peers/format");
  const metric = {
    key: "repayment_ratio" as const, label: "", higherIsBetter: false, you: 0.3, groupMedian: 0.1, groupP25: 0, groupP75: 0.2,
    percentile: 88, outsideGroup: false, comfortableMedian: null
  };
  assert.equal(positionSentence(metric), "Higher than 88% of the group");
  assert.equal(isFavourable(metric), false, "higher repayments are not the better side");
  assert.equal(positionSentence({ ...metric, percentile: 20 }), "Lower than 80% of the group");
  assert.equal(positionSentence({ ...metric, you: -1, outsideGroup: true, percentile: 0 }), "Lower than anyone in the group");
  assert.equal(formatPeerValue("repayment_ratio", 0.284), "28%");
  assert.equal(formatPeerValue("savings_months", 0.54), "0.5 months");
});
