import type { AppDebt, RiskStatus } from "@/lib/domain";

export type ScoreProjectionPoint = {
  month: number;
  label: string;
  currentPath: number;
  recommendedPath: number;
};

export type ScoreProjection = {
  points: ScoreProjectionPoint[];
  currentDelta3: number;
  currentDelta6: number;
  recommendedDelta3: number;
  recommendedDelta6: number;
  impactLabel: "Strong improvement" | "Moderate improvement" | "Stability improvement";
  summary: string;
};

function clampScore(value: number): number {
  return Math.max(300, Math.min(850, Math.round(value)));
}

function baseCurrentDelta(riskStatus: RiskStatus): number {
  if (riskStatus === "HIGH") return -3.2;
  if (riskStatus === "MEDIUM") return -0.8;
  return 0.7;
}

function debtToIncomeRatio(monthlyIncome: number, debts: Pick<AppDebt, "status" | "monthlyObligation">[]): number {
  const activeObligations = debts
    .filter((debt) => debt.status === "ACTIVE")
    .reduce((sum, debt) => sum + debt.monthlyObligation, 0);

  return activeObligations / Math.max(1, monthlyIncome);
}

function legalRiskPenalty(debts: Pick<AppDebt, "status" | "hasLegalJudgment">[]): number {
  const hasJudgment = debts.some((debt) => debt.hasLegalJudgment);
  const hasGarnished = debts.some((debt) => debt.status === "GARNISHED");

  if (hasJudgment && hasGarnished) return 2.4;
  if (hasJudgment || hasGarnished) return 1.4;
  return 0;
}

export function buildScoreProjection(input: {
  creditScore: number;
  riskStatus: RiskStatus;
  monthlyIncome: number;
  debts: Pick<AppDebt, "status" | "monthlyObligation" | "missedPaymentsCount" | "hasLegalJudgment">[];
}): ScoreProjection {
  const missedPayments = input.debts.reduce((sum, debt) => sum + debt.missedPaymentsCount, 0);
  const ratio = debtToIncomeRatio(input.monthlyIncome, input.debts);

  const utilizationPenalty =
    ratio > 0.7 ? 3.5 : ratio > 0.5 ? 2.1 : ratio > 0.35 ? 1.1 : ratio > 0.2 ? 0.4 : 0;
  const paymentPenalty = Math.min(4, missedPayments * 0.22);
  const legalPenalty = legalRiskPenalty(input.debts);

  const currentMonthlyDelta = baseCurrentDelta(input.riskStatus) - utilizationPenalty - paymentPenalty - legalPenalty;

  const recoveryBoost =
    input.riskStatus === "HIGH" ? 6.2 : input.riskStatus === "MEDIUM" ? 4.8 : 2.8;
  const recommendedMonthlyDelta = Math.max(currentMonthlyDelta + 1.5, currentMonthlyDelta + recoveryBoost);

  const points: ScoreProjectionPoint[] = [
    {
      month: 0,
      label: "Now",
      currentPath: clampScore(input.creditScore),
      recommendedPath: clampScore(input.creditScore)
    }
  ];

  let currentScore = input.creditScore;
  let recommendedScore = input.creditScore;

  for (let month = 1; month <= 6; month += 1) {
    const currentStep = currentMonthlyDelta + (month > 3 ? -0.3 : 0);
    const recommendedStep = recommendedMonthlyDelta + (month > 3 ? -0.8 : 0);

    currentScore = clampScore(currentScore + currentStep);
    recommendedScore = clampScore(recommendedScore + recommendedStep);

    points.push({
      month,
      label: `${month}m`,
      currentPath: currentScore,
      recommendedPath: recommendedScore
    });
  }

  const currentDelta3 = points[3].currentPath - points[0].currentPath;
  const currentDelta6 = points[6].currentPath - points[0].currentPath;
  const recommendedDelta3 = points[3].recommendedPath - points[0].recommendedPath;
  const recommendedDelta6 = points[6].recommendedPath - points[0].recommendedPath;

  const improvementGap = recommendedDelta6 - currentDelta6;
  const impactLabel =
    improvementGap >= 30
      ? "Strong improvement"
      : improvementGap >= 12
        ? "Moderate improvement"
        : "Stability improvement";

  const summary =
    impactLabel === "Strong improvement"
      ? "Following the recommended actions can materially improve score momentum over six months."
      : impactLabel === "Moderate improvement"
        ? "Recommended actions can improve score direction and reduce downside risk over six months."
        : "Recommended actions mainly help keep score stable and avoid further deterioration.";

  return {
    points,
    currentDelta3,
    currentDelta6,
    recommendedDelta3,
    recommendedDelta6,
    impactLabel,
    summary
  };
}
