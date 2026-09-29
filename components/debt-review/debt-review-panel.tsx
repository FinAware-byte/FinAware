import Link from "next/link";
import { Card } from "@/components/common/card";
import { WorkingTable } from "@/components/common/working-table";
import type { DebtReviewScreen, Inclusion, Verdict } from "@/lib/finance/debt-review";
import { formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Verdict first, with the one figure it turns on; then the sum that produced it; then every
// account and whether a counsellor could include it. The cost of going ahead is shown beside the
// sum on purpose — debt review is a serious step and the page should not read as a sales pitch.

const verdictTone: Record<Verdict, { card: string; chip: string; label: string }> = {
  likely: { card: "border-rose-200 bg-rose-50/50", chip: "bg-rose-600 text-white", label: "Likely to qualify" },
  possible: { card: "border-amber-200 bg-amber-50/50", chip: "bg-amber-500 text-white", label: "Might qualify" },
  unlikely: { card: "border-emerald-200 bg-emerald-50/40", chip: "bg-emerald-600 text-white", label: "Unlikely to qualify" },
  not_suitable: { card: "border-slate-200", chip: "bg-slate-600 text-white", label: "Not suitable" },
  need_info: { card: "border-slate-200", chip: "bg-slate-500 text-white", label: "More detail needed" }
};

const inclusionTone: Record<Inclusion, { chip: string; label: string }> = {
  yes: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Can be included" },
  maybe: { chip: "bg-amber-50 text-amber-700 ring-amber-200", label: "Counsellor to confirm" },
  no: { chip: "bg-slate-100 text-slate-600 ring-slate-200", label: "Paid outside debt review" }
};

export function DebtReviewPanel({ screen }: { screen: DebtReviewScreen }) {
  const tone = verdictTone[screen.verdict];
  const wantsCounsellor = screen.verdict === "likely" || screen.verdict === "possible" || screen.legalFlags.length > 0;

  return (
    <div className="space-y-4">
      <Card className={tone.card}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", tone.chip)}>{tone.label}</span>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{screen.headline}</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-700">{screen.summary}</p>
          </div>

          {screen.leftOver !== null && (
            <div className="shrink-0 sm:text-right">
              <p
                className={cn(
                  "text-3xl font-bold tracking-tight tabular-nums",
                  screen.leftOver < 0 ? "text-rose-700" : "text-slate-900"
                )}
              >
                {formatZAR(Math.abs(screen.leftOver))}
              </p>
              <p className="text-xs text-slate-600">{screen.leftOver < 0 ? "short every month" : "left over every month"}</p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          {screen.verdict === "need_info" ? (
            <Link
              href="/financial-profile"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Add your living costs
            </Link>
          ) : wantsCounsellor ? (
            <Link
              href="/help?type=DEBT_COUNSELLOR"
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Ask a debt counsellor
            </Link>
          ) : null}
          {wantsCounsellor && (
            <Link
              href="/help/case-summary"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Prepare a case summary
            </Link>
          )}
          <Link
            href="/money-plan"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            See your Money Plan
          </Link>
        </div>
      </Card>

      {screen.legalFlags.length > 0 && (
        <div role="note" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">Legal steps on your record</p>
          <ul className="space-y-2">
            {screen.legalFlags.map((flag) => (
              <li key={flag.record} className="text-sm text-amber-900">
                <span className="font-semibold">{flag.record}.</span> {flag.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="text-lg font-semibold text-slate-900">The calculation</h3>
          <p className="mb-3 mt-1 text-sm text-slate-600">
            Over-indebted means you cannot meet all your credit repayments on time. This is the sum a counsellor starts
            from.
          </p>
          <WorkingTable lines={screen.working} />
          {screen.missedPayments > 0 && (
            <p className="mt-3 text-xs text-slate-500">
              {screen.missedPayments} missed payment{screen.missedPayments === 1 ? "" : "s"} on record. The Act weighs
              repayment history alongside the sums.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="text-lg font-semibold text-slate-900">If you apply</h3>
          <p className="mb-3 mt-1 text-sm text-slate-600">Debt review protects you, but it has costs of its own.</p>
          <ul className="space-y-2">
            {screen.consequences.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-slate-700">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {screen.accounts.length > 0 && (
        <Card>
          <h3 className="text-lg font-semibold text-slate-900">Your accounts</h3>
          <p className="mb-3 mt-1 text-sm text-slate-600">
            Debt review covers credit agreements in your own name. Anything else keeps being paid in full.
          </p>
          <ul className="divide-y divide-slate-100">
            {screen.accounts.map((account) => {
              const inclusion = inclusionTone[account.inclusion];
              return (
                <li key={account.debtId} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{account.creditor}</p>
                      <p className="text-xs text-slate-500">
                        {account.type} · {formatZAR(account.balance)} owed · {formatZAR(account.monthly)} a month
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1", inclusion.chip)}>
                      {inclusion.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{account.why}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <p className="text-xs text-slate-500">
        A screen worked out from the figures on record, not an assessment. Only a debt counsellor registered with the
        National Credit Regulator can declare you over-indebted. Demo data — not financial or legal advice.
      </p>
    </div>
  );
}
