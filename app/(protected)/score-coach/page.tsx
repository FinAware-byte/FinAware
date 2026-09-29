import Link from "next/link";
import { redirect } from "next/navigation";
import { ScoreCoachPanel } from "@/components/score/score-coach-panel";
import { getSessionUserId } from "@/lib/auth/session";
import { listDebtsForUser } from "@/lib/db/debts";
import { getUserById } from "@/lib/db/users";
import { coachCreditScore } from "@/lib/finance/score-coach";

// Score coach: the five factors behind the calculated credit score, ordered by the points each is
// currently giving up. Everything on this page is arithmetic on lib/finance/credit-score.
export default async function ScoreCoachPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const [user, debts] = await Promise.all([getUserById(userId), listDebtsForUser(userId)]);
  if (!user) redirect("/login");

  const coaching = coachCreditScore({ monthlyIncome: user.monthlyIncome, debts });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Score Coach</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Your credit score is calculated from five factors. This page shows what each one is costing you and which
          single change gains the most — worked out from your own accounts, not from general advice.{" "}
          <Link href="/about-the-model" className="font-semibold text-brand-700 hover:underline">
            How the score is calculated
          </Link>
        </p>
      </div>

      <ScoreCoachPanel coaching={coaching} />
    </div>
  );
}
