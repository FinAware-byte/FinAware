"use client";

import { useState } from "react";
import type { CaseSummary } from "@/lib/help/case-summary";

// The brief itself, laid out to print on a page. The buttons sit outside the printed region.

export function CaseSummaryView({ summary, firstName }: { summary: CaseSummary; firstName: string }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([summary.plainText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `case-summary-${firstName.toLowerCase().replace(/[^a-z]+/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(summary.plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap gap-2">
        <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700">
          Print
        </button>
        <button type="button" onClick={download} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Download as text
        </button>
        <button type="button" onClick={() => void copy()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <article className="print-region rounded-xl border border-slate-200 bg-white p-6 shadow-card print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-xl font-semibold text-slate-900">Case summary — {firstName}</h2>
          <p className="text-xs text-slate-500">
            Prepared with FinAware on {new Date().toLocaleDateString("en-ZA", { dateStyle: "long" })}
          </p>
        </header>

        <p className="mt-4 text-sm leading-relaxed text-slate-800">{summary.narrative}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {summary.narrativeSource === "model" ? "Paragraph worded by AI from the figures below." : "Paragraph worked out from the figures below."}
        </p>

        {summary.urgent.length > 0 && (
          <section className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 print:bg-white">
            <h3 className="text-sm font-semibold text-rose-900">Needs attention first</h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-rose-900">
              {summary.urgent.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {summary.sections.map((section) => (
            <section key={section.title} className={section.title === "In the client's words" ? "sm:col-span-2" : undefined}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.title}</h3>
              <dl className="mt-1.5 space-y-1 text-sm">
                {section.rows.map((row) => (
                  <div key={row.label} className="flex justify-between gap-4 border-b border-slate-100 pb-1">
                    <dt className="text-slate-600">{row.label}</dt>
                    <dd className="text-right font-medium text-slate-900">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        {summary.debts.length > 0 && (
          <section className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts</h3>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Creditor</th>
                    <th className="py-1 pr-3 font-medium">Type</th>
                    <th className="py-1 pr-3 text-right font-medium">Owed</th>
                    <th className="py-1 pr-3 text-right font-medium">Rate</th>
                    <th className="py-1 pr-3 text-right font-medium">Monthly</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 font-medium">Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {summary.debts.map((debt) => (
                    <tr key={`${debt.creditor}-${debt.type}`}>
                      <td className="py-1 pr-3 text-slate-900">{debt.creditor}</td>
                      <td className="py-1 pr-3 text-slate-600">{debt.type}</td>
                      <td className="py-1 pr-3 text-right">{debt.balance}</td>
                      <td className="py-1 pr-3 text-right">{debt.rate}</td>
                      <td className="py-1 pr-3 text-right">{debt.monthly}</td>
                      <td className="py-1 pr-3">{debt.status}</td>
                      <td className="py-1 text-slate-600">{debt.record}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <p className="mt-5 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
          Figures are as recorded in FinAware and should be confirmed against statements. The credit score is calculated by
          FinAware, not a credit bureau. Not financial or legal advice.
        </p>
      </article>
    </div>
  );
}
