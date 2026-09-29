import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateCreditScore } from "../../lib/finance/credit-score";
import { buildModelCards, type ModelInfo } from "../../lib/models/model-card";
import { RULES } from "../../lib/risk/recommendation-rules";

// Shaped like the live /model-info response.
const info: ModelInfo = {
  model: { name: "Gradient Boosting", version: "1.0" },
  target: { name: "risk_tier", version: "1.0", status: "proposed" },
  trainedAt: "2026-09-21T23:19:08+00:00",
  metrics: { accuracy: 0.9969, f1_macro: 0.997, f1_weighted: 0.997 },
  evaluation: { trainRows: 25939, testRows: 6485, highRiskRecall: 0.9955, meanTopProbability: 0.9964 },
  paymentMissModel: {
    available: true,
    model: { name: "Gradient Boosting", version: "1.0" },
    trainedAt: "2026-09-23T12:31:35+00:00",
    decisionThreshold: 0.18,
    metrics: { roc_auc: 0.6986, average_precision: 0.2045, brier: 0.1007 },
    beatsPastMissRateHeuristic: true,
    evaluation: {
      trainRows: 1280,
      testRows: 418,
      testMissRate: 0.1148,
      precisionAtThreshold: 0.2165,
      recallAtThreshold: 0.4375,
      baselines: {
        "Baseline: always the base rate": { roc_auc: 0.5 },
        "Baseline: the user's past miss rate": { roc_auc: 0.6209 }
      }
    }
  }
};

const card = (cards: ReturnType<typeof buildModelCards>, key: string) => cards.find((c) => c.key === key)!;
const options = { languageModelConfigured: false };

test("every card says what the model does and what it does not", () => {
  for (const c of buildModelCards(info, options)) {
    assert.ok(c.does.length > 40, `${c.key} needs a real description`);
    assert.ok(c.doesNot.length > 0, `${c.key} must state its limits`);
  }
});

test("the risk model's headline figure is the running model's, not a copy", () => {
  assert.equal(card(buildModelCards(info, options), "risk").figures[0].value, "99.7%");
  const retrained = buildModelCards({ ...info, metrics: { ...info.metrics, accuracy: 0.9 } }, options);
  assert.equal(card(retrained, "risk").figures[0].value, "90.0%", "a retrained model must show its own figure");
  assert.equal(card(retrained, "risk").figures[0].source, "live");
});

test("the risk model's accuracy is never shown without what it is accuracy at", () => {
  const risk = card(buildModelCards(info, options), "risk");
  assert.match(risk.figures[0].detail ?? "", /agreement with a rule/);
  // And the ablation that explains it sits on the same card, cited.
  const ablation = risk.figures.find((f) => f.label === "Without the rubric's own inputs");
  assert.equal(ablation?.source, "report");
  assert.ok(ablation?.reference);
});

test("a provisional risk definition is flagged, an approved one is not", () => {
  assert.equal(card(buildModelCards(info, options), "risk").status?.tone, "warn");
  const approved = buildModelCards({ ...info, target: { ...info.target, status: "approved" } }, options);
  assert.equal(card(approved, "risk").status, null);
});

test("the missed-payment model is compared with the simplest guesses it had to beat", () => {
  const payment = card(buildModelCards(info, options), "payment");
  const auc = payment.figures[0];
  assert.equal(auc.value, "70% of the time");
  assert.match(auc.detail ?? "", /always the base rate 0\.50/);
  assert.match(auc.detail ?? "", /past miss rate 0\.62/);
  // Precision is low, and the card must say most warnings are false alarms.
  assert.match(payment.figures[1].detail ?? "", /22% are actually missed/);
});

test("with the model service down, live figures are withheld and nothing is filled in", () => {
  const cards = buildModelCards(null, options);
  const risk = card(cards, "risk");
  assert.ok(risk.unavailable);
  assert.equal(risk.figures.some((f) => f.source === "live"), false);
  assert.ok(risk.figures.some((f) => f.source === "report"), "the documented analysis can still be shown");
  assert.equal(card(cards, "payment").figures.length, 0);
  assert.ok(card(cards, "payment").unavailable);
});

test("the credit score card shows the calculation's own weights", () => {
  const scoreCard = card(buildModelCards(info, options), "credit-score");
  const factors = calculateCreditScore({ monthlyIncome: 0, debts: [] }).factors;
  assert.deepEqual(
    scoreCard.figures.map((f) => f.label),
    factors.map((f) => f.label)
  );
  const total = scoreCard.figures.reduce((sum, f) => sum + Number(f.value.replace("%", "")), 0);
  assert.equal(total, 100);
});

test("a live figure is never given a report's citation", () => {
  for (const c of buildModelCards(info, options)) {
    for (const figure of c.figures) {
      if (figure.source !== "report") assert.equal(figure.reference, undefined, `${c.key}: ${figure.label}`);
      else assert.ok(figure.reference, `${c.key}: ${figure.label} needs its citation`);
    }
  }
});

test("the peer groups card states how weakly the groups separate", () => {
  const withPeers = buildModelCards(
    {
      ...info,
      peerSegments: {
        available: true,
        model: { name: "KMeans", version: "1.0" },
        k: 6,
        silhouette: 0.2812,
        recordsUsed: 24647,
        recordsExcluded: 7777,
        segments: [{ name: "Lower income", share: 0.09 }]
      }
    },
    options
  );
  const peers = card(withPeers, "peers");
  assert.equal(peers.figures[1].value, "Silhouette 0.28");
  // en-ZA groups thousands with a non-breaking space.
  assert.match((peers.figures[2].detail ?? "").replace(/\u00a0/g, " "), /7 777 records were left out/);
  assert.ok(peers.doesNot.some((line) => /synthetic/.test(line)));
  // Without the model loaded, nothing is shown in its place.
  assert.equal(card(buildModelCards(info, options), "peers").figures.length, 0);
});

test("the rules card counts the rules that exist", () => {
  const rules = card(buildModelCards(info, options), "recommendations");
  assert.equal(rules.figures[0].value, String(RULES.length));
});

test("the language model card reports whether one is configured, without anything else", () => {
  assert.equal(card(buildModelCards(info, { languageModelConfigured: true }), "wording").status?.label, "Configured");
  assert.equal(card(buildModelCards(info, options), "wording").status?.tone, "warn");
});
