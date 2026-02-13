import { type RecommendationContext, getAiRecommendations } from "@/lib/ai/recommendations";
import { listDebtsForUser } from "@/lib/db/debts";
import { prisma } from "@/lib/db/prisma";
import { getUserById } from "@/lib/db/users";
import type { RiskStatus } from "@/lib/domain";

export type RehabPlan = {
  riskStatus: RiskStatus;
  strategyTitle: "Urgent Intervention" | "Stabilize & Repair" | "Maintenance & Growth";
  recommendations?: Awaited<ReturnType<typeof getAiRecommendations>>;
};

function getStrategyTitle(riskStatus: RiskStatus): RehabPlan["strategyTitle"] {
  if (riskStatus === "HIGH") return "Urgent Intervention";
  if (riskStatus === "MEDIUM") return "Stabilize & Repair";
  return "Maintenance & Growth";
}

export async function getRehabPlanForUser(
  userId: string,
  context?: RecommendationContext,
  options?: { includeRecommendations?: boolean }
): Promise<RehabPlan | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  const includeRecommendations = options?.includeRecommendations ?? true;
  if (!includeRecommendations) {
    return {
      riskStatus: user.riskStatus,
      strategyTitle: getStrategyTitle(user.riskStatus)
    };
  }

  const debts = await listDebtsForUser(userId);
  const recommendations = await getAiRecommendations(user, debts, context);

  await prisma.aiRecommendations
    .create({
      data: {
        risk_level: user.riskStatus,
        recommendation_text: JSON.stringify(recommendations)
      }
    })
    .catch(() => {});

  return {
    riskStatus: user.riskStatus,
    strategyTitle: getStrategyTitle(user.riskStatus),
    recommendations
  };
}
