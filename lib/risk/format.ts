import { formatZAR } from "@/lib/format";
import type { RiskLevel } from "@/lib/risk/types";

const RATIO_FEATURES = new Set(["debt_to_income_ratio", "expense_to_income_ratio", "loan_to_income_ratio"]);
const RAND_FEATURES = new Set([
  "monthly_income_zar",
  "monthly_expenses_zar",
  "savings_zar",
  "loan_amount_zar",
  "monthly_emi_zar",
  "disposable_income_zar",
  "monthly_surplus_after_emi_zar"
]);

// Plain-language value for a driver (no technical feature names are shown to users).
export function formatDriverValue(feature: string, value: number | string): string {
  if (typeof value === "string") return value;
  if (RATIO_FEATURES.has(feature)) return `${Math.round(value * 100)}% of income`;
  if (RAND_FEATURES.has(feature)) return formatZAR(value);
  if (feature === "savings_to_income_ratio") return `${value.toFixed(1)}× annual income`;
  if (feature === "savings_coverage_months") return `${value.toFixed(1)} months of expenses`;
  if (feature === "loan_interest_rate_pct") return `${value.toFixed(1)}%`;
  return String(Math.round(value));
}

// Whole-number percentages that always add up to 100 (largest-remainder rounding, spec §45b).
export function wholePercentages(probabilities: Record<RiskLevel, number>): Record<RiskLevel, number> {
  const levels: RiskLevel[] = ["Low", "Medium", "High"];
  const raw = levels.map((level) => probabilities[level] * 100);
  const floors = raw.map(Math.floor);
  let remaining = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((value, index) => ({ index, rest: value - floors[index] })).sort((a, b) => b.rest - a.rest);
  for (const { index } of order) {
    if (remaining <= 0) break;
    floors[index] += 1;
    remaining -= 1;
  }
  return { Low: floors[0], Medium: floors[1], High: floors[2] };
}

export const riskTone: Record<RiskLevel, { badge: string; bar: string; text: string }> = {
  Low: { badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", text: "text-emerald-700" },
  Medium: { badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500", text: "text-amber-700" },
  High: { badge: "bg-red-100 text-red-700", bar: "bg-red-500", text: "text-red-700" }
};
