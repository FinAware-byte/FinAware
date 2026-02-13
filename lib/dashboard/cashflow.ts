import type { AppDebt, AppUser, RiskStatus } from "@/lib/domain";

export type CashflowSnapshot = {
  monthlyIncome: number;
  estimatedLivingExpenses: number;
  monthlyDebtObligations: number;
  totalMonthlyExpenses: number;
  netCashflow: number;
  debtToIncomeRatio: number;
  expenseToIncomeRatio: number;
  scorePressure: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  projectedScoreDelta30d: number;
};

export function estimateLivingExpenses(user: Pick<AppUser, "employmentStatus" | "monthlyIncome" | "riskStatus">): number {
  const employmentRatio =
    user.employmentStatus === "UNEMPLOYED"
      ? 0.62
      : user.employmentStatus === "STUDENT"
        ? 0.42
        : user.employmentStatus === "SELF_EMPLOYED"
          ? 0.52
          : 0.48;

  const riskRatio = user.riskStatus === "HIGH" ? 0.08 : user.riskStatus === "MEDIUM" ? 0.04 : 0.02;
  return Number(Math.max(2200, user.monthlyIncome * (employmentRatio + riskRatio)).toFixed(2));
}

export function calculateCashflowSnapshot(input: {
  monthlyIncome: number;
  nonDebtExpenses: number;
  debts: Pick<AppDebt, "status" | "monthlyObligation">[];
}): CashflowSnapshot {
  const monthlyDebtObligations = input.debts
    .filter((debt) => debt.status === "ACTIVE")
    .reduce((sum, debt) => sum + debt.monthlyObligation, 0);

  const totalMonthlyExpenses = input.nonDebtExpenses + monthlyDebtObligations;
  const netCashflow = input.monthlyIncome - totalMonthlyExpenses;
  const debtToIncomeRatio = input.monthlyIncome > 0 ? monthlyDebtObligations / input.monthlyIncome : 1;
  const expenseToIncomeRatio = input.monthlyIncome > 0 ? totalMonthlyExpenses / input.monthlyIncome : 1;

  const scorePressure =
    netCashflow >= input.monthlyIncome * 0.12 && debtToIncomeRatio < 0.28
      ? "POSITIVE"
      : netCashflow >= 0
        ? "NEUTRAL"
        : "NEGATIVE";

  const projectedScoreDelta30d =
    scorePressure === "POSITIVE" ? 15 : scorePressure === "NEUTRAL" ? 4 : -12;

  return {
    monthlyIncome: Number(input.monthlyIncome.toFixed(2)),
    estimatedLivingExpenses: Number(input.nonDebtExpenses.toFixed(2)),
    monthlyDebtObligations: Number(monthlyDebtObligations.toFixed(2)),
    totalMonthlyExpenses: Number(totalMonthlyExpenses.toFixed(2)),
    netCashflow: Number(netCashflow.toFixed(2)),
    debtToIncomeRatio: Number(debtToIncomeRatio.toFixed(4)),
    expenseToIncomeRatio: Number(expenseToIncomeRatio.toFixed(4)),
    scorePressure,
    projectedScoreDelta30d
  };
}

export function getCashflowGuidance(snapshot: CashflowSnapshot, riskStatus: RiskStatus): string[] {
  const actions: string[] = [];

  if (snapshot.netCashflow < 0) {
    actions.push("Cut non-essential expenses until monthly cashflow is non-negative.");
    actions.push("Request revised repayment terms on highest-rate debt to lower monthly pressure.");
  } else if (snapshot.netCashflow < snapshot.monthlyIncome * 0.1) {
    actions.push("Increase free cashflow buffer to at least 10% of monthly income.");
  } else {
    actions.push("Preserve surplus cashflow and automate extra debt repayments.");
  }

  if (snapshot.debtToIncomeRatio > 0.35) {
    actions.push("Debt-to-income is high; prioritize reducing revolving balances first.");
  }

  if (riskStatus === "HIGH") {
    actions.push("Focus on payment consistency this month to avoid further score decline.");
  }

  if (riskStatus !== "LOW" && snapshot.projectedScoreDelta30d > 0) {
    actions.push("Sustaining this plan for 2-3 months can gradually improve score trend.");
  }

  return actions;
}
