import { redirect } from "next/navigation";
import { AiRecommendationsCard } from "@/components/cards/ai-recommendations-card";
import { RiskBadge } from "@/components/cards/risk-badge";
import { Card } from "@/components/common/card";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

type RehabPlanPayload = {
  riskStatus: "HIGH" | "MEDIUM" | "LOW";
  strategyTitle: "Urgent Intervention" | "Stabilize & Repair" | "Maintenance & Growth";
};

export default async function RehabPage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("rehab", `/rehab/plan/${sessionUserId}`, {
    method: "POST",
    body: JSON.stringify({})
  });

  if (result.status < 200 || result.status >= 300) {
    return <p className="text-sm text-slate-500">Unable to load rehabilitation plan.</p>;
  }
  const plan = result.payload as RehabPlanPayload;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Financial Rehabilitation</h1>
          <p className="text-sm text-slate-500">Personalized strategy to improve your financial standing.</p>
        </div>
        <RiskBadge risk={plan.riskStatus} />
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-slate-900">{plan.strategyTitle}</h2>
        <p className="mt-2 text-sm text-slate-600">
          This strategy is simulated and should guide your next actions over the next 30 days.
        </p>
      </Card>

      <AiRecommendationsCard title="AI-Powered Recommendations" compact />
    </div>
  );
}
