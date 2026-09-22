import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { asyncRoute } from "../../../services/shared/async-route";
import { callServiceJson } from "../../../lib/microservices/proxy";
import { fieldErrors, financialProfileSchema } from "../../../lib/risk/validation";
import { assessFinancialRisk } from "./assess";

// Financial API Service (sequence diagram): validates financial information, orchestrates the risk
// assessment and generates recommendations. No direct database access.
const app = createServiceApp("financial-api");

app.get("/financial-profile/:userId", asyncRoute("financial-api", async (request, response) => {
  const result = await callServiceJson("financial-data", `/financial-profile/${request.params.userId}`, { method: "GET" });
  response.status(result.status).json(result.payload);
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
