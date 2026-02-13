import type { AppDebt, AppUser, RiskStatus } from "@/lib/domain";

export function calculateDashboardMetrics(debts: AppDebt[]): {
  totalDebt: number;
  monthlyObligations: number;
  activeAccounts: number;
} {
  const activeDebts = debts.filter((debt) => debt.status === "ACTIVE");
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const monthlyObligations = activeDebts.reduce((sum, debt) => sum + debt.monthlyObligation, 0);

  return {
    totalDebt,
    monthlyObligations,
    activeAccounts: activeDebts.length
  };
}

export function getFinancialAgeDetails(
  user: Pick<AppUser, "realAge" | "riskStatus">,
  debts: Pick<AppDebt, "missedPaymentsCount">[]
): {
  financialAge: number;
  message: string;
} {
  const totalMissedPayments = debts.reduce((sum, debt) => sum + debt.missedPaymentsCount, 0);
  const riskShift = user.riskStatus === "HIGH" ? 8 : user.riskStatus === "MEDIUM" ? 3 : -2;
  const paymentShift = Math.min(8, Math.floor(totalMissedPayments / 3));
  const financialAge = Math.max(18, user.realAge + riskShift + paymentShift);

  const message =
    financialAge > user.realAge
      ? `You are financially older by ${financialAge - user.realAge} years.`
      : `You are financially younger by ${user.realAge - financialAge} years.`;

  return { financialAge, message };
}

export function getRiskFactors(riskStatus: RiskStatus, debts: AppDebt[]): string[] {
  const factors = ["High Debt Utilization", "Payment History"];

  if (riskStatus !== "LOW") {
    factors.push("Income Volatility");
  }

  if (debts.some((debt) => debt.hasLegalJudgment)) {
    factors.push("Legal judgments");
  }

  if (debts.some((debt) => debt.status === "GARNISHED")) {
    factors.push("Garnishee orders");
  }

  return factors;
}
