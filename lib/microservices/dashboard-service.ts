import { calculateDashboardMetrics, getFinancialAgeDetails, getRiskFactors } from "@/lib/dashboard/metrics";
import { buildScoreProjection, type ScoreProjection } from "@/lib/dashboard/score-projection";
import { listDebtsForUser } from "@/lib/db/debts";
import { getUserById } from "@/lib/db/users";
import type { RiskStatus } from "@/lib/domain";

export type DashboardOverview = {
  user: {
    id: string;
    fullName: string;
    creditScore: number;
    riskStatus: RiskStatus;
    monthlyIncome: number;
  };
  metrics: {
    totalDebt: number;
    activeAccounts: number;
    monthlyObligations: number;
    financialAge: number;
    financialAgeMessage: string;
  };
  scoreProjection: ScoreProjection;
  riskFactors: string[];
  debtComposition: Array<{ creditorName: string; amount: number }>;
  creditAccounts: Array<{
    id: string;
    creditorName: string;
    debtType: string;
    status: string;
    balance: number;
    monthlyObligation: number;
    paymentsMadeCount: number;
    totalPaymentsCount: number;
  }>;
};

export async function getDashboardOverview(userId: string): Promise<DashboardOverview | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  const debts = await listDebtsForUser(userId);
  const metrics = calculateDashboardMetrics(debts);
  const financialAge = getFinancialAgeDetails(user, debts);
  const riskFactors = getRiskFactors(user.riskStatus, debts);
  const scoreProjection = buildScoreProjection({
    creditScore: user.creditScore,
    riskStatus: user.riskStatus,
    monthlyIncome: user.monthlyIncome,
    debts
  });

  const debtCompositionMap = debts
    .filter((debt) => debt.status === "ACTIVE")
    .reduce<Record<string, number>>((acc, debt) => {
      acc[debt.creditorName] = (acc[debt.creditorName] ?? 0) + debt.balance;
      return acc;
    }, {});

  return {
    user: {
      id: user.id,
      fullName: user.fullName,
      creditScore: user.creditScore,
      riskStatus: user.riskStatus,
      monthlyIncome: user.monthlyIncome
    },
    metrics: {
      totalDebt: metrics.totalDebt,
      activeAccounts: metrics.activeAccounts,
      monthlyObligations: metrics.monthlyObligations,
      financialAge: financialAge.financialAge,
      financialAgeMessage: financialAge.message
    },
    scoreProjection,
    riskFactors,
    debtComposition: Object.entries(debtCompositionMap).map(([creditorName, amount]) => ({
      creditorName,
      amount
    })),
    creditAccounts: debts.map((debt) => ({
      id: debt.id,
      creditorName: debt.creditorName,
      debtType: debt.debtType,
      status: debt.status,
      balance: debt.balance,
      monthlyObligation: debt.monthlyObligation,
      paymentsMadeCount: debt.paymentsMadeCount,
      totalPaymentsCount: debt.totalPaymentsCount
    }))
  };
}
