import type { CallJson } from "./assess";
import { buildMoneyPlan, type MoneyPlan, type PlanDebt, type EssentialItem } from "../../../lib/budget/plan";
import type { ApiError } from "../../../lib/risk/types";

// Assembles the money plan: budget and debts from the Financial Data Service, and — when it is
// available — the missed-payment probability from the ML service, which only ever changes the
// wording of the credit guidance, never a single rand of the allocation.

const ML_TIMEOUT_MS = Number(process.env.ML_SERVICE_TIMEOUT_MS ?? 15000);

export type MoneyPlanResult = {
  status: number;
  body: (MoneyPlan & { essentials: EssentialItem[]; savingsKnown: boolean }) | ApiError;
};

type BudgetBundle = {
  essentials: EssentialItem[];
  monthlyIncome: number;
  savings: number | null;
  creditScore: number;
  debts: PlanDebt[];
};

/** Highest per-debt probability: the plan speaks about "missing a payment", not a specific one. */
async function missedPaymentProbability(userId: string, callJson: CallJson): Promise<number | null> {
  try {
    const outlook = await callJson("financial-data", `/payment-features/${userId}`, { method: "GET" });
    if (outlook.status !== 200) return null;
    const payload = outlook.payload as { ok: boolean; debts?: unknown[] };
    if (!payload.ok || !payload.debts?.length) return null;

    const prediction = await callJson("ml", "/predict/payment-miss", {
      method: "POST",
      body: JSON.stringify({ debts: payload.debts }),
      signal: AbortSignal.timeout(ML_TIMEOUT_MS)
    });
    if (prediction.status !== 200) return null;
    const value = (prediction.payload as { anyMissedProbability?: number }).anyMissedProbability;
    return typeof value === "number" ? value : null;
  } catch {
    // The plan is rules, not a model: if the model is unreachable the plan is still correct.
    return null;
  }
}

/**
 * The plan for figures the user is still typing. Nothing is written: the budget on record and the
 * income on record both stay exactly as they were, so a user can explore freely and only the
 * "Save" action changes anything.
 */
export async function previewMoneyPlan(
  userId: string,
  overrides: { essentials: EssentialItem[]; monthlyIncome?: number },
  callJson: CallJson
): Promise<MoneyPlanResult> {
  const budget = await callJson("financial-data", `/budget/${userId}`, { method: "GET" });
  if (budget.status === 404) {
    return { status: 404, body: { error: "NOT_FOUND", message: "User not found" } };
  }
  if (budget.status !== 200) {
    return {
      status: 503,
      body: { error: "DATA_UNAVAILABLE", message: "Your budget could not be loaded. Please try again." }
    };
  }

  const bundle = budget.payload as BudgetBundle;
  const probability = await missedPaymentProbability(userId, callJson);
  const monthlyIncome = overrides.monthlyIncome ?? bundle.monthlyIncome;

  const plan = buildMoneyPlan({
    monthlyIncome,
    essentials: overrides.essentials,
    debts: bundle.debts,
    savings: bundle.savings ?? 0,
    creditScore: bundle.creditScore,
    missedPaymentProbability: probability
  });

  const warnings = [...plan.warnings];
  if (overrides.monthlyIncome !== undefined && overrides.monthlyIncome !== bundle.monthlyIncome) {
    warnings.push(
      `This plan uses a trial income of R${overrides.monthlyIncome.toLocaleString("en-ZA")} instead of the R${bundle.monthlyIncome.toLocaleString("en-ZA")} on your profile. Nothing has been changed.`
    );
  }
  if (bundle.savings === null) {
    warnings.push(
      "Your savings are not on record yet, so the safety-net figures assume you are starting from zero."
    );
  }

  return {
    status: 200,
    body: { ...plan, warnings, essentials: overrides.essentials, savingsKnown: bundle.savings !== null }
  };
}

export async function getMoneyPlan(userId: string, callJson: CallJson): Promise<MoneyPlanResult> {
  const budget = await callJson("financial-data", `/budget/${userId}`, { method: "GET" });
  if (budget.status === 404) {
    return { status: 404, body: { error: "NOT_FOUND", message: "User not found" } };
  }
  if (budget.status !== 200) {
    return {
      status: 503,
      body: { error: "DATA_UNAVAILABLE", message: "Your budget could not be loaded. Please try again." }
    };
  }

  const bundle = budget.payload as BudgetBundle;
  const probability = await missedPaymentProbability(userId, callJson);

  const plan = buildMoneyPlan({
    monthlyIncome: bundle.monthlyIncome,
    essentials: bundle.essentials,
    debts: bundle.debts,
    // Savings are unknown until the user fills in the ML financial profile. Treating that as zero
    // would overstate the safety-net gap, so the plan says so instead (see savingsKnown).
    savings: bundle.savings ?? 0,
    creditScore: bundle.creditScore,
    missedPaymentProbability: probability
  });

  const warnings = [...plan.warnings];
  if (bundle.savings === null) {
    warnings.push(
      "Your savings are not on record yet, so the safety-net figures assume you are starting from zero. Add them on your financial profile for a more accurate plan."
    );
  }

  return {
    status: 200,
    body: { ...plan, warnings, essentials: bundle.essentials, savingsKnown: bundle.savings !== null }
  };
}
