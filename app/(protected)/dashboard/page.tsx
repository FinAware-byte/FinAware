import { redirect } from "next/navigation";
import { AiRecommendationsCard } from "@/components/cards/ai-recommendations-card";
import { MetricCard } from "@/components/cards/metric-card";
import { RiskBadge } from "@/components/cards/risk-badge";
import { CreditScoreProjectionChart } from "@/components/charts/credit-score-projection-chart";
import { DebtCompositionChart } from "@/components/charts/debt-composition-chart";
import { Card } from "@/components/common/card";
import { DownloadOverviewButton } from "@/components/forms/download-overview-button";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { formatZAR } from "@/lib/format";

type DashboardOverviewPayload = {
  user: {
    id: string;
    fullName: string;
    creditScore: number;
    riskStatus: "HIGH" | "MEDIUM" | "LOW";
    monthlyIncome: number;
  };
  metrics: {
    totalDebt: number;
    activeAccounts: number;
    monthlyObligations: number;
    financialAge: number;
    financialAgeMessage: string;
  };
  scoreProjection: {
    points: Array<{
      month: number;
      label: string;
      currentPath: number;
      recommendedPath: number;
    }>;
    currentDelta3: number;
    currentDelta6: number;
    recommendedDelta3: number;
    recommendedDelta6: number;
    impactLabel: string;
    summary: string;
  };
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

function debtTypeLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function debtStatusTone(status: string): string {
  if (status === "ACTIVE") return "bg-emerald-100 text-emerald-700";
  if (status === "RECONSIDERED") return "bg-amber-100 text-amber-700";
  return "bg-rose-100 text-rose-700";
}

export default async function DashboardPage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("dashboard", `/dashboard/overview/${sessionUserId}`, {
    method: "GET"
  });

  if (result.status === 401 || result.status === 404) {
    redirect("/login");
  }

  if (result.status < 200 || result.status >= 300) {
    const payload = result.payload as { message?: string };
    return (
      <p className="text-sm text-slate-500">
        Unable to load dashboard data. {payload.message ? `(${payload.message})` : ""}
      </p>
    );
  }

  const overview = result.payload as DashboardOverviewPayload;
  const projection = overview.scoreProjection;
  const current3 = projection.currentDelta3 >= 0 ? `+${projection.currentDelta3}` : `${projection.currentDelta3}`;
  const current6 = projection.currentDelta6 >= 0 ? `+${projection.currentDelta6}` : `${projection.currentDelta6}`;
  const recommended3 =
    projection.recommendedDelta3 >= 0 ? `+${projection.recommendedDelta3}` : `${projection.recommendedDelta3}`;
  const recommended6 =
    projection.recommendedDelta6 >= 0 ? `+${projection.recommendedDelta6}` : `${projection.recommendedDelta6}`;
  const scoreGap6m = projection.recommendedDelta6 - projection.currentDelta6;

  const sortedDebtComposition = [...overview.debtComposition].sort((a, b) => b.amount - a.amount);
  const topCreditor = sortedDebtComposition[0];
  const topCreditorShare =
    overview.metrics.totalDebt > 0 && topCreditor
      ? Math.round((topCreditor.amount / overview.metrics.totalDebt) * 100)
      : 0;
  const debtToIncomeRatio =
    overview.user.monthlyIncome > 0
      ? (overview.metrics.monthlyObligations / overview.user.monthlyIncome) * 100
      : 100;
  const debtPressureLabel =
    debtToIncomeRatio >= 60 ? "High pressure" : debtToIncomeRatio >= 40 ? "Moderate pressure" : "Manageable pressure";
  const debtPressureTone =
    debtToIncomeRatio >= 60
      ? "bg-rose-100 text-rose-700"
      : debtToIncomeRatio >= 40
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";
  const creditAccounts = [...overview.creditAccounts].sort((a, b) => b.balance - a.balance);
  const paymentsMade = creditAccounts.reduce((sum, account) => sum + account.paymentsMadeCount, 0);
  const totalPaymentRecords = creditAccounts.reduce((sum, account) => sum + account.totalPaymentsCount, 0);
  const paymentReliability = totalPaymentRecords > 0 ? (paymentsMade / totalPaymentRecords) * 100 : 0;
  const creditTypeBreakdown = creditAccounts.reduce<Record<string, { count: number; balance: number }>>(
    (acc, account) => {
      const type = debtTypeLabel(account.debtType);
      if (!acc[type]) {
        acc[type] = { count: 0, balance: 0 };
      }
      acc[type].count += 1;
      acc[type].balance += account.balance;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500">Welcome back, {overview.user.fullName}.</p>
        </div>
        <DownloadOverviewButton />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Credit Score"
          value={String(overview.user.creditScore)}
          subtitle="Updated from active debt behavior"
          tone="blue"
          right={<RiskBadge risk={overview.user.riskStatus} />}
        />
        <MetricCard
          title="Total Debt"
          value={formatZAR(overview.metrics.totalDebt)}
          subtitle={`Across ${overview.metrics.activeAccounts} active accounts`}
          tone="amber"
        />
        <MetricCard
          title="Monthly Obligations"
          value={formatZAR(overview.metrics.monthlyObligations)}
          subtitle="Expected monthly debt commitments"
          tone="cyan"
        />
        <MetricCard
          title="Financial vs Real Age"
          value={`${overview.metrics.financialAge} years`}
          subtitle={overview.metrics.financialAgeMessage}
          tone="emerald"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Debt analytics</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Debt composition by creditor</h3>
              <p className="mt-1 text-sm text-slate-500">
                Breakdown of active debt by creditor so you can target the largest pressure points first.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-indigo-100 px-3 py-1 text-indigo-700">
                {sortedDebtComposition.length} creditors
              </span>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">
                Top share: {topCreditorShare}%
              </span>
            </div>
          </div>
          <div className="mt-4">
            <DebtCompositionChart data={overview.debtComposition} />
          </div>
        </Card>

        <Card className="bg-gradient-to-b from-white to-indigo-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Debt learning snapshot</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">What this chart tells you</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="font-semibold text-slate-800">Top creditor concentration</p>
              <p className="mt-1 text-slate-600">
                {topCreditor ? `${topCreditor.creditorName} holds ${topCreditorShare}% of total debt.` : "No active debt concentration."}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-slate-800">Obligation-to-income ratio</p>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${debtPressureTone}`}>
                  {debtPressureLabel}
                </span>
              </div>
              <p className="mt-1 text-slate-600">{debtToIncomeRatio.toFixed(1)}% of monthly income goes to debt obligations.</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <p className="font-semibold text-indigo-800">At-a-glance focus</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-indigo-700">
                {overview.riskFactors.map((factor) => (
                  <li key={factor}>{factor}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Credit outlook simulator</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Projected score: current vs recommended</h3>
              <p className="mt-1 text-sm text-slate-500">
                3-month and 6-month simulation if payment behavior remains unchanged versus recommended actions.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                {projection.impactLabel}
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                Potential 6m lift: +{scoreGap6m}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <CreditScoreProjectionChart data={projection.points} />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <p className="font-semibold">Below 620</p>
              <p>High-risk zone. Missed payments can pull score down quickly.</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <p className="font-semibold">620-739</p>
              <p>Fair zone. Consistency in payments starts to lift profile.</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              <p className="font-semibold">740+</p>
              <p>Good zone. Maintain low utilization to preserve gains.</p>
            </div>
          </div>
        </Card>

        <Card className="bg-gradient-to-b from-white to-blue-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Score coaching snapshot</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">3 and 6 month comparison</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <p className="font-semibold text-orange-800">Current payment behavior</p>
              <p className="mt-1 text-orange-700">3 months: {current3} points</p>
              <p className="text-orange-700">6 months: {current6} points</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="font-semibold text-blue-800">Recommended actions</p>
              <p className="mt-1 text-blue-700">3 months: {recommended3} points</p>
              <p className="text-blue-700">6 months: {recommended6} points</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <p className="font-semibold text-emerald-800">Opportunity window</p>
              <p className="mt-1 text-emerald-700">Following recommendations can improve the 6-month path by {scoreGap6m} points.</p>
            </div>
            <p className="text-slate-600">{projection.summary}</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit accounts ledger</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">All credit accounts and repayment progress</h3>
            <p className="mt-1 text-sm text-slate-600">
              Educational account view grouped by credit type, outstanding balance, and payments made so far.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-700">
              <p className="font-semibold">Accounts</p>
              <p>{creditAccounts.length}</p>
            </div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-700">
              <p className="font-semibold">Payments made</p>
              <p>{paymentsMade}</p>
            </div>
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700">
              <p className="font-semibold">Payment reliability</p>
              <p>{paymentReliability.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(creditTypeBreakdown)
            .sort((a, b) => b[1].balance - a[1].balance)
            .map(([type, stats]) => (
              <div key={type} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
                <span className="font-semibold">{type}</span>: {stats.count} acc | {formatZAR(stats.balance)}
              </div>
            ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">Creditor</th>
                <th className="px-4 py-3">Credit Type</th>
                <th className="px-4 py-3">Outstanding</th>
                <th className="px-4 py-3">Monthly Obligation</th>
                <th className="px-4 py-3">Payments Made</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {creditAccounts.map((account) => {
                const paymentRatio =
                  account.totalPaymentsCount > 0
                    ? (account.paymentsMadeCount / account.totalPaymentsCount) * 100
                    : 0;

                return (
                  <tr key={account.id} className="border-t border-slate-200 bg-white">
                    <td className="px-4 py-3 font-medium text-slate-800">{account.creditorName}</td>
                    <td className="px-4 py-3 text-slate-700">{debtTypeLabel(account.debtType)}</td>
                    <td className="px-4 py-3 text-slate-900">{formatZAR(account.balance)}</td>
                    <td className="px-4 py-3 text-slate-700">{formatZAR(account.monthlyObligation)}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-800">
                        {account.paymentsMadeCount}/{account.totalPaymentsCount}
                      </p>
                      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                        <div
                          className="h-1.5 rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(6, Math.min(100, paymentRatio))}%` }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${debtStatusTone(account.status)}`}>
                        {account.status.replaceAll("_", " ")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <AiRecommendationsCard />
    </div>
  );
}
