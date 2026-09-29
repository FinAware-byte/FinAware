import type { CallJson } from "./assess";
import type { ApiError, FinancialProfile, MlFeaturePayload, MlPrediction } from "../../../lib/risk/types";
import { simulationOverridesSchema, fieldErrors } from "../../../lib/risk/validation";

// "What if?" — scores a hypothetical version of the user's profile.
//
// Nothing here writes: no Risk_Assessment row, no recommendations, no history entry. A simulation
// the user is still dragging a slider through is not an assessment, and the stored history must
// only ever contain results the user actually requested.

const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 15000);

export type SimulationResult = {
  status: number;
  body:
    | {
        simulated: true;
        features: MlFeaturePayload;
        prediction: Pick<MlPrediction, "riskLevel" | "riskScore" | "probabilities">;
        whatIf: unknown;
      }
    | ApiError;
};

function fail(status: number, error: string, message: string, details?: unknown): SimulationResult {
  return { status, body: { error, message, ...(details ? { fieldErrors: details } : {}) } as ApiError };
}

export async function simulateRisk(userId: string, body: unknown, callJson: CallJson): Promise<SimulationResult> {
  const parsed = simulationOverridesSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return fail(422, "INVALID_INPUT", "Those values cannot be used for a simulation.", fieldErrors(parsed.error));
  }

  const data = await callJson("financial-data", `/financial-data/${userId}`, { method: "GET" });
  if (data.status === 404) return fail(404, "NOT_FOUND", "User not found");
  if (data.status !== 200) {
    return fail(503, "DATA_UNAVAILABLE", "Your financial data could not be retrieved. Please try again.");
  }

  const { profile, features } = data.payload as { profile: FinancialProfile | null; features: MlFeaturePayload | null };
  if (!profile || !features) {
    return fail(409, "PROFILE_REQUIRED", "Please complete your financial profile before running a simulation.");
  }

  // The stored profile is the starting point; only the fields the user moved are replaced.
  const simulated: MlFeaturePayload = { ...features, ...parsed.data };

  const [prediction, whatIf] = await Promise.all([
    callJson("ml", "/predict", {
      method: "POST",
      body: JSON.stringify(simulated),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS)
    }),
    callJson("ml", "/what-if", {
      method: "POST",
      body: JSON.stringify(simulated),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS)
    })
  ]);

  if (prediction.status === 503) {
    return fail(503, "MODEL_UNAVAILABLE", "The risk model is not available right now. Please try again shortly.");
  }
  if (prediction.status === 422) {
    const detail = (prediction.payload as { message?: string }).message ?? "Invalid values";
    return fail(422, "INVALID_INPUT", `The risk model could not use those values: ${detail}`);
  }
  if (prediction.status !== 200) {
    return fail(502, "PREDICTION_FAILED", "The simulation could not be completed. Please try again.");
  }

  const ml = prediction.payload as MlPrediction;
  return {
    status: 200,
    body: {
      simulated: true,
      features: simulated,
      prediction: { riskLevel: ml.riskLevel, riskScore: ml.riskScore, probabilities: ml.probabilities },
      // A failed what-if must not sink the simulation: the probabilities are still useful.
      whatIf: whatIf.status === 200 ? whatIf.payload : null
    }
  };
}
