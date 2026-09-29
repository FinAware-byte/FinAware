import Link from "next/link";
import { redirect } from "next/navigation";
import { CaseSummaryView } from "@/components/help/case-summary-view";
import { getSessionUserId } from "@/lib/auth/session";
import { listDebtsForUser } from "@/lib/db/debts";
import { listLegalRecordTypes } from "@/lib/db/legal-records";
import { getUserById } from "@/lib/db/users";
import type { AppConsultationRequest } from "@/lib/domain";
import { screenDebtReview } from "@/lib/finance/debt-review";
import { buildCaseSummary, narrateCaseSummary } from "@/lib/help/case-summary";
import { callServiceJson } from "@/lib/microservices/proxy";
import type { FinancialProfileView, RiskAssessmentRecord } from "@/lib/risk/types";

// Case summary: the brief a user takes to an advisor. Gathered from the same sources as the
// Debt Review Check and the risk assessment, so nothing here can disagree with those pages.
export default async function CaseSummaryPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const [user, debts, legalRecordTypes, profile, latest, requests] = await Promise.all([
    getUserById(userId),
    listDebtsForUser(userId),
    listLegalRecordTypes(userId),
    callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" }),
    callServiceJson("financial-api", `/risk-assessment/${userId}/latest`, { method: "GET" }),
    callServiceJson("help", `/help/requests/${userId}`, { method: "GET" })
  ]);
  if (!user) redirect("/login");

  const view = profile.status === 200 ? (profile.payload as FinancialProfileView) : null;
  const monthlyExpenses = view?.profile ? view.profile.monthlyExpenses : null;
  const monthlyIncome = view?.profile ? view.profile.monthlyIncome : user.monthlyIncome;
  const assessment = latest.status === 200 ? (latest.payload as { assessment: RiskAssessmentRecord | null }).assessment : null;
  const lastRequest =
    requests.status === 200 ? (requests.payload as Array<AppConsultationRequest & { createdAt: string }>)[0] ?? null : null;

  const screen = screenDebtReview({ monthlyIncome, monthlyExpenses, debts, legalRecordTypes });

  const summary = await narrateCaseSummary(
    buildCaseSummary({
      firstName: user.name,
      age: user.realAge,
      employmentStatus: user.employmentStatus,
      monthlyIncome,
      monthlyExpenses,
      savings: view?.profile?.savings ?? null,
      creditScore: user.creditScore,
      debts,
      legalRecordTypes,
      risk: assessment
        ? {
            level: assessment.riskLevel,
            score: assessment.riskScore,
            assessedAt: assessment.predictionDate,
            drivers: assessment.drivers.filter((d) => d.direction === "increases_risk").slice(0, 3).map((d) => d.label)
          }
        : null,
      debtReview: screen,
      request: lastRequest ? { assistanceType: lastRequest.assistanceType, message: lastRequest.message } : null,
      preparedAt: new Date()
    })
  );

  return (
    <div className="space-y-4">
      <div className="no-print">
        <Link href="/help" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Get Help
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Case Summary</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          A one-page brief to share with a counsellor or advisor, so your first conversation starts from the facts. It is
          built from your figures in FinAware — check it, then print, download or copy it. It is not sent to anyone
          unless you send it.
        </p>
      </div>
      <CaseSummaryView summary={summary} firstName={user.name} />
    </div>
  );
}
