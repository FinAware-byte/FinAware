import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/common/card";
import { FinancialProfileForm } from "@/components/risk/financial-profile-form";
import { getSessionUserId } from "@/lib/auth/session";
import { formatZAR } from "@/lib/format";
import { callServiceJson } from "@/lib/microservices/proxy";
import type { FinancialProfileView } from "@/lib/risk/types";

// Use case "Manage Financial Profile" — activity diagram: enter or update financial information → validate.
export default async function FinancialProfilePage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const result = await callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" });
  if (result.status === 404) redirect("/login");
  if (result.status !== 200) {
    const payload = result.payload as { message?: string };
    return (
      <p className="text-sm text-slate-500">
        Unable to load your financial profile. {payload.message ? `(${payload.message})` : ""}
      </p>
    );
  }

  const view = result.payload as FinancialProfileView;
  const profile = view.profile;
  const initial = {
    monthlyIncome: String(profile?.monthlyIncome ?? view.defaults.monthlyIncome ?? ""),
    monthlyExpenses: profile ? String(profile.monthlyExpenses) : "",
    savings: profile ? String(profile.savings) : "",
    creditScore: String(profile?.creditScore ?? view.defaults.creditScore),
    financialGoal: profile?.financialGoal ?? ""
  };
  const activeDebts = view.debts.filter((debt) => debt.status === "ACTIVE");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Financial Profile</h1>
        <p className="text-sm text-slate-500">
          Enter or update the financial information used for your ML Financial Risk Assessment.
          {!profile && " Income and credit score are pre-filled from your existing details — please check them."}
        </p>
      </div>

      <FinancialProfileForm initial={initial} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Debts included in the assessment</h2>
            <p className="text-xs text-slate-500">
              Active debts are read from your Debts &amp; Liabilities page. Monthly repayments:{" "}
              {formatZAR(activeDebts.length ? view.monthlyObligations : 0)}.
            </p>
          </div>
          <Link href="/debts" className="text-sm font-semibold text-brand-700 hover:underline">
            Manage debts →
          </Link>
        </div>
        {activeDebts.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No active debts.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {activeDebts.map((debt) => (
              <li key={`${debt.creditorName}-${debt.debtType}-${debt.balance}`} className="flex justify-between py-2">
                <span className="text-slate-700">
                  {debt.creditorName} <span className="text-xs text-slate-400">({debt.interestRate}% interest)</span>
                </span>
                <span className="font-medium text-slate-900">{formatZAR(debt.balance)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
