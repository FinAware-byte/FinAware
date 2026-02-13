import type { RiskStatus } from "@/lib/domain";

export function getRiskStatusFromIdentifier(idNumberOrPassport: string): RiskStatus {
  // Why: business simulation requires deterministic risk assignment from identifier suffix.
  if (idNumberOrPassport.endsWith("999")) return "HIGH";
  if (idNumberOrPassport.endsWith("555")) return "MEDIUM";
  return "LOW";
}
