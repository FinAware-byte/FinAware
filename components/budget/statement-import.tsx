"use client";

import { useMemo, useRef, useState } from "react";
import { findSpendingAnomalies, type AnomalyReport } from "@/lib/budget/anomalies";
import type { EssentialCategory } from "@/lib/budget/plan";
import {
  CATEGORY_LABELS,
  categorise,
  parseStatementCsv,
  summariseStatement,
  type CategorisedTransaction,
  type StatementCategory
} from "@/lib/budget/statement";
import { formatZAR, ordinal } from "@/lib/format";
import { cn } from "@/lib/utils";

// Fill the essentials from a bank statement. The file is read here, in the browser: it is never
// uploaded, and nothing is stored until the user presses Save on the plan — and then only the
// category totals, not a single transaction.

const MAX_BYTES = 2_000_000;

const OUTFLOW_CATEGORIES = (Object.keys(CATEGORY_LABELS) as StatementCategory[]).filter((category) => category !== "income");

const dateLabel = (date: Date) => date.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

function UnusualSpending({
  report,
  monthlySurplus,
  fromStatement
}: {
  report: AnomalyReport;
  monthlySurplus: number | null;
  /** True when the spare figure uses this statement's essentials because the plan has none yet. */
  fromStatement: boolean;
}) {
  if (!report.enoughHistory) {
    return (
      <p className="text-xs text-slate-500">
        Unusual-month alerts need at least two complete months before the latest one. This statement has{" "}
        {report.monthsCompared}.
      </p>
    );
  }
  const when = report.throughDay ? `${report.month}, to the ${ordinal(report.throughDay)}` : report.month;
  if (report.anomalies.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
        Nothing unusual in {when}, compared with your previous {report.monthsCompared} months.
      </p>
    );
  }

  const overSpare = monthlySurplus !== null && report.extraThisMonth > monthlySurplus;
  const byWhen = report.throughDay ? ` by the ${ordinal(report.throughDay)}` : "";
  return (
    <div role="note" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50/70 p-3">
      <p className="text-sm font-semibold text-amber-900">{when} breaks your usual pattern</p>
      <ul className="space-y-2">
        {report.anomalies.map((anomaly) => (
          <li key={anomaly.label} className="text-sm text-amber-900">
            <span className="font-semibold">{anomaly.label}:</span>{" "}
            {anomaly.kind === "new_payee"
              ? `${formatZAR(anomaly.amount)}, to someone not in your earlier months. A new debit order is worth checking — a loan, a subscription, or something you never agreed to?`
              : `${formatZAR(anomaly.amount)}, against a usual ${formatZAR(anomaly.usual)}${byWhen}.`}
            {anomaly.topTransactions.length > 0 && anomaly.kind !== "new_payee" && (
              <span className="block text-xs text-amber-800">
                Mostly {anomaly.topTransactions.map((t) => `${t.description} ${formatZAR(t.amount)}`).join(", ")}.
              </span>
            )}
          </li>
        ))}
      </ul>
      {report.extraThisMonth > 0 && monthlySurplus !== null && (
        <p className={cn("border-t pt-2 text-sm", overSpare ? "border-rose-200 font-semibold text-rose-800" : "border-amber-200 text-amber-900")}>
          {overSpare
            ? `That is ${formatZAR(report.extraThisMonth)} of unusual spending — more than the ${formatZAR(Math.max(0, monthlySurplus))} your plan leaves spare each month. At this pace a debit order could bounce; it is the time to stop, before one does.`
            : `That is ${formatZAR(report.extraThisMonth)} of unusual spending. ${fromStatement ? "With the essentials on this statement, your plan would leave" : "Your plan leaves"} ${formatZAR(monthlySurplus)} spare, so it fits this month — but it is money that was going to clear debt.`}
        </p>
      )}
    </div>
  );
}

export function StatementImport({
  onApply,
  plan = null
}: {
  onApply: (essentials: Record<EssentialCategory, number>) => void;
  /** The plan's figures, to say whether unusual spending threatens a debit order. */
  plan?: { monthlyIncome: number; essentialsTotal: number; debtMinimumsTotal: number; surplus: number } | null;
}) {
  const [transactions, setTransactions] = useState<CategorisedTransaction[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function load(csv: string, name: string) {
    const parsed = parseStatementCsv(csv);
    if (parsed.error) {
      setError(parsed.error);
      setTransactions(null);
      return;
    }
    setError(null);
    setNotice(parsed.skipped > 0 ? `${parsed.skipped} row${parsed.skipped === 1 ? "" : "s"} could not be read and were skipped.` : null);
    setFileName(name);
    setTransactions(parsed.transactions.map((t) => ({ ...t, ...categorise(t.description, t.amount) })));
  }

  async function readFile(file: File) {
    if (file.size > MAX_BYTES) {
      setError("That file is larger than a statement should be. Export a few months at a time.");
      return;
    }
    load(await file.text(), file.name);
  }

  async function loadSample() {
    try {
      const response = await fetch("/samples/sample-statement.csv");
      load(await response.text(), "sample-statement.csv (made-up data)");
    } catch {
      setError("The sample statement could not be loaded.");
    }
  }

  function move(id: number, category: StatementCategory) {
    setTransactions((current) => current?.map((t) => (t.id === id ? { ...t, category, keyword: "you" } : t)) ?? null);
  }

  const summary = useMemo(() => (transactions ? summariseStatement(transactions) : null), [transactions]);
  const anomalies = useMemo(() => (transactions ? findSpendingAnomalies(transactions) : null), [transactions]);
  const outflows = transactions?.filter((t) => t.amount < 0) ?? [];

  return (
    <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Fill these in from a bank statement</p>
          <p className="text-xs text-slate-600">
            Download a CSV from your bank&apos;s app or internet banking. It is read on this device and never uploaded.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Choose a CSV bank statement"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Choose a CSV statement
          </button>
          <button
            type="button"
            onClick={() => void loadSample()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Try a sample
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {summary && transactions && (
        <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">{fileName}</span> · {dateLabel(summary.from)} to {dateLabel(summary.to)}
            {" · "}
            {summary.months} month{summary.months === 1 ? "" : "s"} · {transactions.length} transactions. Figures below are
            monthly averages.
            {notice && <span className="block text-amber-800">{notice}</span>}
          </p>

          {anomalies && (
            <UnusualSpending
              report={anomalies}
              // A plan with no essentials yet overstates what is spare — it leaves living costs out
              // entirely. Until they are entered, the statement's own essentials stand in.
              monthlySurplus={
                plan === null
                  ? null
                  : plan.essentialsTotal > 0
                    ? plan.surplus
                    : plan.monthlyIncome - summary.essentialsTotal - plan.debtMinimumsTotal
              }
              fromStatement={plan !== null && plan.essentialsTotal === 0}
            />
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your essentials, each month</p>
              <dl className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
                {(Object.entries(summary.essentials) as Array<[EssentialCategory, number]>)
                  .filter(([, amount]) => amount > 0)
                  .map(([category, amount]) => (
                    <div key={category} className="flex justify-between gap-3 px-3 py-1.5">
                      <dt className="text-slate-700">{CATEGORY_LABELS[category]}</dt>
                      <dd className="tabular-nums text-slate-900">{formatZAR(amount)}</dd>
                    </div>
                  ))}
                <div className="flex justify-between gap-3 px-3 py-1.5 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatZAR(summary.essentialsTotal)}</dd>
                </div>
              </dl>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Left out, and why</p>
              <ul className="mt-2 space-y-2">
                {summary.leftOut.map((item) => (
                  <li key={item.category} className="rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="font-medium text-slate-800">{CATEGORY_LABELS[item.category]}</span>
                      <span className="tabular-nums text-slate-700">{formatZAR(item.monthly)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{item.reason}</p>
                  </li>
                ))}
                {summary.moneyIn > 0 && (
                  <li className="text-xs text-slate-500">Money in averaged {formatZAR(summary.moneyIn)} a month.</li>
                )}
              </ul>
            </div>
          </div>

          <details className="group">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
              Check the {outflows.length} payments{summary.uncategorised > 0 ? `, ${summary.uncategorised} not recognised` : ""}
            </summary>
            <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {outflows.map((t) => (
                    <tr key={t.id} className={cn(t.category === "unsorted" && "bg-amber-50/60")}>
                      <td className="whitespace-nowrap px-3 py-1.5 text-xs text-slate-500">{dateLabel(t.date)}</td>
                      <td className="px-3 py-1.5 text-slate-800">
                        {t.description}
                        {t.keyword && (
                          <span className="block text-[11px] text-slate-400">
                            {t.keyword === "you" ? "moved by you" : `matched “${t.keyword}”`}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-slate-800">{formatZAR(-t.amount)}</td>
                      <td className="px-3 py-1.5">
                        <select
                          aria-label={`Category for ${t.description}`}
                          value={t.category}
                          onChange={(event) => move(t.id, event.target.value as StatementCategory)}
                          className="w-full min-w-[9rem] rounded border border-slate-300 px-2 py-1 text-xs"
                        >
                          {OUTFLOW_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {CATEGORY_LABELS[category]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => {
                onApply(summary.essentials);
                setTransactions(null);
              }}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Use these for my essentials
            </button>
            <button
              type="button"
              onClick={() => setTransactions(null)}
              className="text-sm font-semibold text-slate-600 hover:underline"
            >
              Cancel
            </button>
            <p className="text-xs text-slate-500">Replaces the figures above. Nothing is saved until you press Save.</p>
          </div>
        </div>
      )}
    </div>
  );
}
