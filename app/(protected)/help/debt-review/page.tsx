import Link from "next/link";
import { redirect } from "next/navigation";
import { DebtReviewPanel } from "@/components/debt-review/debt-review-panel";
import { getSessionUserId } from "@/lib/auth/session";
import { listDebtsForUser } from "@/lib/db/debts";
import { listLegalRecordTypes } from "@/lib/db/legal-records";
import { getUserById } from "@/lib/db/users";
import { screenDebtReview } from "@/lib/finance/debt-review";
import { callServiceJson } from "@/lib/microservices/proxy";
import type { FinancialProfileView } from "@/lib/risk/types";

// Debt review check: the step before asking for a debt counsellor. It sits under Get Help rather
// than in its own tab because that is where the decision it informs is made.
export default async function DebtReviewPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const [user, debts, legalRecordTypes, profile] = await Promise.all([
    getUserById(userId),
    listDebtsForUser(userId),
    listLegalRecordTypes(userId),
    callServiceJson("financial-api", `/financial-profile/${userId}`, { method: "GET" })
  ]);
  if (!user) redirect("/login");

  // Living costs come from the financial profile, where they are entered excluding debt
  // repayments — exactly the figure the over-indebtedness sum needs.
  const view = profile.status === 200 ? (profile.payload as FinancialProfileView) : null;
  const monthlyExpenses = view?.profile ? view.profile.monthlyExpenses : null;
  const monthlyIncome = view?.profile ? view.profile.monthlyIncome : user.monthlyIncome;

  const screen = screenDebtReview({ monthlyIncome, monthlyExpenses, debts, legalRecordTypes });

  return (
    <div className="space-y-4">
      <div>
        <Link href="/help" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Get Help
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Debt Review Check</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Would debt review under the National Credit Act help you? This check works it out from your own accounts —
          and shows which of them a debt counsellor could include.
        </p>
      </div>

      <DebtReviewPanel screen={screen} />
    </div>
  );
}
