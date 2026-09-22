import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { asyncRoute } from "../../../services/shared/async-route";
import {
  createRecommendations,
  createRiskAssessment,
  getAssessment,
  getFinancialData,
  getFinancialProfileView,
  getLatestAssessment,
  listAssessmentHistory,
  upsertFinancialProfile
} from "../../../lib/microservices/financial-data-service";
import { financialProfileSchema } from "../../../lib/risk/validation";
import type { GeneratedRecommendation, MlFeaturePayload, MlPrediction } from "../../../lib/risk/types";

// Financial Data Service (sequence diagram). Internal only: called by the Financial API Service.
const app = createServiceApp("financial-data");

app.get("/financial-profile/:userId", asyncRoute("financial-data", async (request, response) => {
  const view = await getFinancialProfileView(String(request.params.userId ?? ""));
  if (!view) {
    response.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    return;
  }
  response.json(view);
}));

app.put("/financial-profile/:userId", asyncRoute("financial-data", async (request, response) => {
  // Why: defence in depth — the API service validates first, but the data layer never stores unchecked input.
  const parsed = financialProfileSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "Invalid profile" });
    return;
  }
  const profile = await upsertFinancialProfile(String(request.params.userId ?? ""), parsed.data);
  if (!profile) {
    response.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    return;
  }
  response.json(profile);
}));

app.get("/financial-data/:userId", asyncRoute("financial-data", async (request, response) => {
  const data = await getFinancialData(String(request.params.userId ?? ""));
  if (!data) {
    response.status(404).json({ error: "NOT_FOUND", message: "User not found" });
    return;
  }
  response.json(data);
}));

app.post("/risk-assessments/:userId", asyncRoute("financial-data", async (request, response) => {
  const body = (request.body ?? {}) as { prediction?: MlPrediction; features?: MlFeaturePayload };
  if (!body.prediction || !body.features) {
    response.status(400).json({ error: "INVALID_INPUT", message: "prediction and features are required" });
    return;
  }
  const created = await createRiskAssessment(String(request.params.userId ?? ""), {
    prediction: body.prediction,
    features: body.features
  });
  if (!created) {
    response.status(404).json({ error: "NOT_FOUND", message: "Financial profile not found" });
    return;
  }
  response.status(201).json(created);
}));

app.post("/risk-assessments/by-id/:assessmentId/recommendations", asyncRoute("financial-data", async (request, response) => {
  const body = (request.body ?? {}) as { recommendations?: GeneratedRecommendation[] };
  if (!Array.isArray(body.recommendations)) {
    response.status(400).json({ error: "INVALID_INPUT", message: "recommendations must be an array" });
    return;
  }
  const count = await createRecommendations(String(request.params.assessmentId ?? ""), body.recommendations);
  if (count === null) {
    response.status(404).json({ error: "NOT_FOUND", message: "Risk assessment not found" });
    return;
  }
  response.status(201).json({ created: count });
}));

app.get("/risk-assessments/by-id/:assessmentId", asyncRoute("financial-data", async (request, response) => {
  const assessment = await getAssessment(String(request.params.assessmentId ?? ""));
  if (!assessment) {
    response.status(404).json({ error: "NOT_FOUND", message: "Risk assessment not found" });
    return;
  }
  response.json(assessment);
}));

app.get("/risk-assessments/:userId/latest", asyncRoute("financial-data", async (request, response) => {
  const assessment = await getLatestAssessment(String(request.params.userId ?? ""));
  response.json({ assessment });
}));

app.get("/risk-assessments/:userId/history", asyncRoute("financial-data", async (request, response) => {
  response.json({ history: await listAssessmentHistory(String(request.params.userId ?? "")) });
}));

const port = resolvePort(process.env.FINANCIAL_DATA_SERVICE_PORT, 4109);
app.listen(port, () => {
  console.log(`finaware-financial-data listening on ${port}`);
});
