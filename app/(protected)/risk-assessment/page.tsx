import Link from "next/link";
import { redirect } from "next/navigation";
import { PaymentOutlook } from "@/components/risk/payment-outlook";
import { PeerComparison } from "@/components/risk/peer-comparison";
import { WhatIfSimulator } from "@/components/risk/what-if-simulator";
import { RiskAssessmentPanel } from "@/components/risk/risk-assessment-panel";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import type { FinancialProfileView, RiskAssessmentRecord, RiskAssessmentSummary } from "@/lib/risk/types";

// Use cases "Assess Financial Risk" and "View Risk Assessment" (UML), reached from the dashboard tabs.
export default async function RiskAssessmentPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const [profile, latest, history] = await Promise.all([
    callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" }),
    callServiceJson("financial-api", `/risk-assessment/${userId}/latest`, { method: "GET" }),
    callServiceJson("financial-api", `/risk-assessment/${userId}/history`, { method: "GET" })
  ]);
  if (profile.status === 404) redirect("/login");

  const header = (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Financial Risk Assessment</h1>
      <p className="text-sm text-slate-500">
        Machine learning analyses your financial profile and debts to estimate your financial risk, explain the main
        factors and suggest next steps.
      </p>
    </div>
  );

  if (profile.status !== 200) {
    return (
      <div className="space-y-4">
        {header}
        <p className="text-sm text-slate-500">The risk assessment service is unavailable right now. Please try again shortly.</p>
      </div>
    );
  }

  if (!(profile.payload as FinancialProfileView).profile) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <p className="text-sm text-slate-700">Start by entering your financial information.</p>
          <Link
            href="/financial-profile"
            className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Complete financial profile
          </Link>
        </div>
        {/* The missed-payment model reads recorded payments, not the financial profile, so it
            has something to say even before the profile is filled in. */}
        <PaymentOutlook />
      </div>
    );
  }

  const assessment = latest.status === 200 ? (latest.payload as { assessment: RiskAssessmentRecord | null }).assessment : null;
  const rows = history.status === 200 ? (history.payload as { history: RiskAssessmentSummary[] }).history : [];

  return (
    <div className="space-y-4">
      {header}
      <RiskAssessmentPanel initialAssessment={assessment} history={rows} />
      <WhatIfSimulator />
      <PeerComparison />
      <PaymentOutlook />
    </div>
  );
}
