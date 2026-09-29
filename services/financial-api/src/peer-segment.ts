import type { CallJson } from "./assess";
import type { MlFeaturePayload } from "../../../lib/risk/types";

// Peer group: the same features the risk model scores, sent to the ML service's /segment. Kept
// apart from the risk assessment so a failure here cannot touch it, as with the payment outlook.

const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 15000);

export async function getPeerSegment(userId: string, callJson: CallJson): Promise<{ status: number; body: unknown }> {
  const data = await callJson("financial-data", `/financial-data/${userId}`, { method: "GET" });
  if (data.status === 404) return { status: 404, body: { error: "NOT_FOUND", message: "User not found" } };
  if (data.status !== 200) {
    return { status: 503, body: { error: "DATA_UNAVAILABLE", message: "Your financial data could not be retrieved." } };
  }

  const { features } = data.payload as { features: MlFeaturePayload | null };
  // Not an error: without a financial profile there is nothing to compare yet.
  if (!features) return { status: 200, body: { available: false, reason: "PROFILE_REQUIRED" } };

  const result = await callJson("ml", "/segment", {
    method: "POST",
    body: JSON.stringify(features),
    signal: AbortSignal.timeout(ML_TIMEOUT_MS)
  });
  if (result.status !== 200) return { status: result.status === 503 ? 503 : 502, body: result.payload };
  return { status: 200, body: { available: true, ...(result.payload as object) } };
}
