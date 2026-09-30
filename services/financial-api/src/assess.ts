import type { ServiceName } from "../../../lib/microservices/proxy";
import type {
  ApiError,
  FinancialProfile,
  MlFeaturePayload,
  MlPrediction,
  RiskAssessmentRecord
} from "../../../lib/risk/types";
import { riskLevels } from "../../../lib/risk/types";
import { generateRecommendations } from "./recommendations";

// Orchestration for POST /risk-assessment — mirrors the sequence diagram step by step.
// The service has no database access of its own; it talks to the Financial Data and ML Prediction services.

export type CallJson = (name: ServiceName, path: string, init?: RequestInit) => Promise<{ status: number; payload: unknown }>;

export type AssessResult = { status: number; body: RiskAssessmentRecord | ApiError };

const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 15000);

function fail(status: number, error: string, message: string): AssessResult {
  return { status, body: { error, message } };
}

function isPrediction(value: unknown): value is MlPrediction {
  const p = value as MlPrediction;
  if (!p || typeof p !== "object" || !riskLevels.includes(p.riskLevel) || typeof p.riskScore !== "number") return false;
  if (!p.probabilities || !Array.isArray(p.topDrivers) || !p.indicators || !p.model) return false;
  const total = riskLevels.reduce((sum, level) => sum + Number(p.probabilities[level] ?? NaN), 0);
  const top = riskLevels.reduce((best, level) => (p.probabilities[level] > p.probabilities[best] ? level : best), riskLevels[0]);
  // Why: never store a prediction whose probabilities do not sum to 1 or whose level is not the most likely class.
  return Math.abs(total - 1) < 1e-4 && top === p.riskLevel;
}

export async function assessFinancialRisk(userId: string, callJson: CallJson): Promise<AssessResult> {
  // 7–11. Retrieve FinancialProfile and Debt data (Financial Data Service → database).
  const data = await callJson("financial-data", `/financial-data/${userId}`, { method: "GET" });
  if (data.status === 404) return fail(404, "NOT_FOUND", "User not found");
  if (data.status !== 200) return fail(503, "DATA_UNAVAILABLE", "Your financial data could not be retrieved. Please try again.");
  const { profile, features } = data.payload as { profile: FinancialProfile | null; features: MlFeaturePayload | null };
  if (!profile || !features) {
    return fail(409, "PROFILE_REQUIRED", "Please complete your financial profile before requesting a risk assessment.");
  }
  if (features.has_loan !== "Yes") {
    return fail(
      409,
      "DEBT_DATA_REQUIRED",
      "Please add your debts and liabilities before requesting a comprehensive Financial Risk Assessment."
    );
  }

  // 12–16. Send financial features → ML Prediction Service (preprocessing, features, prediction).
  const ml = await callJson("ml", "/predict", {
    method: "POST",
    body: JSON.stringify(features),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS)
  });
  if (ml.status === 503) {
    return fail(503, "MODEL_UNAVAILABLE", "The risk model is not available right now. Please try again shortly.");
  }
  if (ml.status === 422) {
    const detail = (ml.payload as { message?: string }).message ?? "Invalid financial information";
    return fail(422, "INVALID_INPUT", `The risk model could not use your information: ${detail}`);
  }
  if (ml.status !== 200 || !isPrediction(ml.payload)) {
    return fail(502, "PREDICTION_FAILED", "The risk prediction could not be completed. Please try again.");
  }
  const prediction = ml.payload;

  // 17–20. Create RiskAssessment (Financial Data Service → INSERT).
  const stored = await callJson("financial-data", `/risk-assessments/${userId}`, {
    method: "POST",
    body: JSON.stringify({ prediction, features })
  });
  if (stored.status !== 201) {
    return fail(500, "STORAGE_FAILED", "Your assessment could not be saved. Please try again.");
  }
  const { assessmentId } = stored.payload as { assessmentId: string };

  // 21. Generate Recommendation (rule engine in this service), then persist it with the assessment.
  const recommendations = generateRecommendations({ prediction, creditScore: features.credit_score });
  const savedRecs = await callJson("financial-data", `/risk-assessments/by-id/${assessmentId}/recommendations`, {
    method: "POST",
    body: JSON.stringify({ recommendations })
  });
  if (savedRecs.status !== 201) {
    return fail(500, "STORAGE_FAILED", "Your recommendations could not be saved. Please try again.");
  }

  // 22. Return risk assessment and recommendation.
  const record = await callJson("financial-data", `/risk-assessments/by-id/${assessmentId}`, { method: "GET" });
  if (record.status !== 200) return fail(500, "STORAGE_FAILED", "Your assessment was saved but could not be loaded.");
  return { status: 201, body: record.payload as RiskAssessmentRecord };
}
