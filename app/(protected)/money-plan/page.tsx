import { redirect } from "next/navigation";
import { MoneyPlanView } from "@/components/budget/money-plan-view";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import type { FinancialProfileView } from "@/lib/risk/types";

// Money plan: what to do with the income left after the essentials (budget rules v1.0).
export default async function MoneyPlanPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  // The goal written on the financial profile, if any, is where the goal planner starts.
  const profile = await callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" });
  const initialGoal =
    profile.status === 200 ? ((profile.payload as FinancialProfileView).profile?.financialGoal ?? "") : "";

  return (
    <div className="relative">
      {/* Glass needs something behind it. Two soft washes give the panels something to pick up,
          and they sit behind everything, are inert to pointer events, and carry no information —
          so nothing is lost if a browser drops them or a reader ignores them. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="liquid-orb absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="liquid-orb-slow absolute -right-16 top-72 h-80 w-80 rounded-full bg-emerald-200/35 blur-3xl" />
      </div>

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Money Plan</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Start with what you must pay every month. FinAware then recommends where to move money so the month
            balances, and where the rest should go to clear debt faster.
          </p>
        </div>
        <MoneyPlanView initialGoal={initialGoal} />
      </div>
    </div>
  );
}
