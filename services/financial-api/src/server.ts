import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { asyncRoute } from "../../../services/shared/async-route";
import { callServiceJson } from "../../../lib/microservices/proxy";
import { budgetPreviewSchema, budgetSchema, fieldErrors, financialProfileSchema } from "../../../lib/risk/validation";
import { assessFinancialRisk } from "./assess";
import { simulateRisk } from "./simulate";
import { getMoneyPlan, previewMoneyPlan } from "./money-plan";
import { getPeerSegment } from "./peer-segment";

// Financial API Service (sequence diagram): validates financial information, orchestrates the risk
// assessment and generates recommendations. No direct database access.
const app = createServiceApp("financial-api");

app.get("/financial-profile/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await callServiceJson("financial-data", `/financial-profile/${request.params.userId}`, { method: "GET" });
  response.status(result.status).json(result.payload);
}));

// Money plan: deterministic budget rules (v1.0), informed by — but never driven by — the models.
app.get("/money-plan/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await getMoneyPlan(String(request.params.userId ?? ""), callServiceJson);
  response.status(result.status).json(result.body);
}));

// Live recalculation while the user types. Reads the budget on record, applies the figures in the
// request, returns the plan — and writes nothing.
app.post("/money-plan/:userId/preview", asyncRoute("financial-api", async (request, response) => {
  const parsed = budgetPreviewSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(422).json({
      error: "INVALID_INPUT",
      message: "Please correct the highlighted amounts.",
      fieldErrors: fieldErrors(parsed.error)
    });
    return;
  }
  const result = await previewMoneyPlan(String(request.params.userId ?? ""), parsed.data, callServiceJson);
  response.status(result.status).json(result.body);
}));

app.get("/budget/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await callServiceJson("financial-data", `/budget/${request.params.userId}`, { method: "GET" });
  response.status(result.status).json(result.payload);
}));

app.put("/budget/:userId", asyncRoute("financial-api", async (request, response) => {
  const parsed = budgetSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({
      error: "INVALID_INPUT",
      message: "Please correct the highlighted amounts.",
      fieldErrors: fieldErrors(parsed.error)
    });
    return;
  }
  const result = await callServiceJson("financial-data", `/budget/${request.params.userId}`, {
    method: "PUT",
    body: JSON.stringify(parsed.data)
  });
  response.status(result.status).json(result.payload);
}));

// Payment outlook: behaviour from the Financial Data Service, scored by the ML service.
// Kept separate from /risk-assessment so a failure here cannot affect the risk flow.
app.get("/payment-outlook/:userId", asyncRoute("financial-api", async (request, response) => {
  const features = await callServiceJson("financial-data", `/payment-features/${request.params.userId}`, { method: "GET" });
  if (features.status !== 200) {
    response.status(features.status).json(features.payload);
    return;
  }
  const payload = features.payload as { ok: boolean; reason?: string; debts?: unknown[]; paymentsOnRecord: number };
  if (!payload.ok) {
    // Not an error: the user simply has nothing to score yet.
    response.status(200).json({ available: false, reason: payload.reason, paymentsOnRecord: payload.paymentsOnRecord });
    return;
  }

  const prediction = await callServiceJson("ml", "/predict/payment-miss", {
    method: "POST",
    body: JSON.stringify({ debts: payload.debts }),
    signal: AbortSignal.timeout(Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 15000))
  });
  if (prediction.status !== 200) {
    response.status(prediction.status === 503 ? 503 : 502).json(prediction.payload);
    return;
  }
  response.json({ available: true, paymentsOnRecord: payload.paymentsOnRecord, ...(prediction.payload as object) });
}));

// Peer group: which band of similar profiles the user sits in, and where within it.
app.get("/peer-segment/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await getPeerSegment(request.params.userId, callServiceJson);
  response.status(result.status).json(result.body);
}));

// Activity diagram: "Validate financial information" → invalid: field errors so the user can correct and resubmit.
app.put("/financial-profile/:userId", asyncRoute("financial-api", async (request, response) => {
  const parsed = financialProfileSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    const errors = fieldErrors(parsed.error);
    response.status(400).json({
      error: "INVALID_INPUT",
      message: "Please correct the highlighted fields.",
      fieldErrors: errors
    });
    return;
  }

  const result = await callServiceJson("financial-data", `/financial-profile/${request.params.userId}`, {
    method: "PUT",
    body: JSON.stringify(parsed.data)
  });
  if (result.status !== 200) {
    response.status(result.status).json(result.payload);
    return;
  }
  response.json({ message: "Validation successful", profile: result.payload });
}));

app.post("/risk-assessment/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await assessFinancialRisk(String(request.params.userId ?? ""), callServiceJson);
  response.status(result.status).json(result.body);
}));

// "What if?" — scored but never stored, so the assessment history stays a record of real requests.
app.post("/risk-assessment/:userId/simulate", asyncRoute("financial-api", async (request, response) => {
  const result = await simulateRisk(String(request.params.userId ?? ""), request.body, callServiceJson);
  response.status(result.status).json(result.body);
}));

app.get("/risk-assessment/:userId/latest", asyncRoute("financial-api", async (request, response) => {
  const result = await callServiceJson("financial-data", `/risk-assessments/${request.params.userId}/latest`, { method: "GET" });
  response.status(result.status).json(result.payload);
}));

app.get("/risk-assessment/:userId/history", asyncRoute("financial-api", async (request, response) => {
  const result = await callServiceJson("financial-data", `/risk-assessments/${request.params.userId}/history`, { method: "GET" });
  response.status(result.status).json(result.payload);
}));

const port = resolvePort(process.env.FINANCIAL_API_SERVICE_PORT, 4108);
app.listen(port, () => {
  console.log(`finaware-financial-api listening on ${port}`);
});
