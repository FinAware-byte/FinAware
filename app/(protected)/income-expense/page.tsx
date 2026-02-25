import { redirect } from "next/navigation";
import { IncomeExpensePlanner } from "@/components/forms/income-expense-planner";
import { estimateLivingExpenses } from "@/lib/dashboard/cashflow";
import { getSessionUserId } from "@/lib/auth/session";
import type { AppDebt } from "@/lib/domain";
import { callServiceJson } from "@/lib/microservices/proxy";

type IdentityProfilePayload = {
  userId: string;
  fullName: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  employmentStatus: "EMPLOYED" | "UNEMPLOYED" | "SELF_EMPLOYED" | "STUDENT";
  creditScore: number;
  riskStatus: "HIGH" | "MEDIUM" | "LOW";
};

export default async function IncomeExpensePage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const [profileResult, debtsResult] = await Promise.all([
    callServiceJson("identity", `/identity/profile/${sessionUserId}`, { method: "GET" }),
    callServiceJson("debts", `/debts/${sessionUserId}`, { method: "GET" })
  ]);

  if (
    profileResult.status === 401 ||
    profileResult.status === 404 ||
    debtsResult.status === 401 ||
    debtsResult.status === 404
  ) {
    redirect("/login");
  }

  if (
    profileResult.status < 200 ||
    profileResult.status >= 300 ||
    debtsResult.status < 200 ||
    debtsResult.status >= 300
  ) {
    const profilePayload = profileResult.payload as { message?: string };
    const debtsPayload = debtsResult.payload as { message?: string };
    const detail = profilePayload.message ?? debtsPayload.message ?? "";
    return (
      <p className="text-sm text-slate-500">
        Unable to load income and expense data. {detail ? `(${detail})` : ""}
      </p>
    );
  }

  const user = profileResult.payload as IdentityProfilePayload;
  const debts = Array.isArray(debtsResult.payload) ? (debtsResult.payload as AppDebt[]) : [];

  if (!user || typeof user.monthlyIncome !== "number") {
    return <p className="text-sm text-slate-500">Unable to load income and expense data.</p>;
  }

  const defaultLivingExpenses = estimateLivingExpenses({
    employmentStatus: user.employmentStatus,
    monthlyIncome: user.monthlyIncome,
    riskStatus: user.riskStatus
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Income vs Expense</h1>
        <p className="text-sm text-slate-500">
          Track current income against debt and living expenses to understand score pressure.
        </p>
      </div>

      <IncomeExpensePlanner
        userId={user.userId}
        bankAccountNumber={user.bankAccountNumber}
        monthlyIncome={user.monthlyIncome}
        defaultLivingExpenses={defaultLivingExpenses}
        debts={debts}
        riskStatus={user.riskStatus}
        creditScore={user.creditScore}
      />
    </div>
  );
}
