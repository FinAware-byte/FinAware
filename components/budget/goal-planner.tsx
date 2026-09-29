"use client";

import { useMemo, useState } from "react";
import { WorkingTable } from "@/components/common/working-table";
import {
  addMonths,
  durationLabel,
  monthLabel,
  monthOf,
  parseGoal,
  testGoal,
  type GoalMonth,
  type GoalVerdict,
  type PlanForGoal
} from "@/lib/budget/goal";
import type { MoneyPlan } from "@/lib/budget/plan";
import { formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";

// Say the goal in a sentence; the fields fill in from it and stay editable, so a misreading is
// one click to fix. The answer is tested against the plan on screen, so changing an essential
// above changes whether the goal fits.

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const EXAMPLES = ["Save R10 000 by December", "Build a 3-month emergency fund", "R5 000 for school fees by January"];

const verdictTone: Record<GoalVerdict, { chip: string; label: string }> = {
  fits: { chip: "bg-emerald-600 text-white", label: "Fits" },
  fits_with_tradeoff: { chip: "bg-sky-600 text-white", label: "Fits, at a cost" },
  tight: { chip: "bg-amber-500 text-white", label: "Only just" },
  does_not_fit: { chip: "bg-rose-600 text-white", label: "Not by then" },
  no_surplus: { chip: "bg-rose-600 text-white", label: "Nothing spare" },
  already_there: { chip: "bg-emerald-600 text-white", label: "Already there" },
  no_time: { chip: "bg-slate-500 text-white", label: "Pick a later month" }
};

const fieldClass =
  "glass-outline mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

type Props = {
  plan: PlanForGoal & Pick<MoneyPlan, "essentialsTotal" | "savings">;
  initialText: string;
};

export function GoalPlanner({ plan, initialText }: Props) {
  const today = useMemo(() => new Date(), []);
  const from = useMemo(() => monthOf(today), [today]);
  const initial = useMemo(() => parseGoal(initialText, today), [initialText, today]);

  const [text, setText] = useState(initialText);
  const [amount, setAmount] = useState(initial.amount !== null ? String(initial.amount) : "");
  const [fundMonths, setFundMonths] = useState<number | null>(initial.emergencyFundMonths);
  const [deadline, setDeadline] = useState<GoalMonth>(initial.deadline ?? addMonths(from, 12));
  const [deadlineAssumed, setDeadlineAssumed] = useState(initial.deadline === null);
  const [saved, setSaved] = useState("");
  const [understood, setUnderstood] = useState(initial.understood);

  // The sentence fills in whatever it states; anything it does not mention keeps its value.
  function readSentence(value: string) {
    setText(value);
    const parsed = parseGoal(value, today);
    setUnderstood(parsed.understood);
    if (parsed.amount !== null) {
      setAmount(String(parsed.amount));
      setFundMonths(null);
    } else if (parsed.emergencyFundMonths !== null) {
      setFundMonths(parsed.emergencyFundMonths);
    }
    if (parsed.deadline) {
      setDeadline(parsed.deadline);
      setDeadlineAssumed(false);
    }
  }

  const isFund = fundMonths !== null;
  const target = isFund ? fundMonths * plan.essentialsTotal : Number(amount);
  const alreadySaved = isFund ? plan.savings : Math.max(0, Number(saved) || 0);
  const ready = Number.isFinite(target) && target > 0;

  const result = useMemo(
    () => (ready ? testGoal({ target, alreadySaved, deadline, from, isEmergencyFund: isFund }, plan) : null),
    [ready, target, alreadySaved, deadline, from, isFund, plan]
  );

  const years = Array.from({ length: 11 }, (_, index) => from.year + index);

  return (
    <section className="glass-panel rounded-2xl border border-white/60 p-6">
      <h2 className="text-lg font-semibold text-slate-900">Plan a goal</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        Say what you are saving for and by when. FinAware works out the monthly amount and tests it against the plan
        above — including what it would cost somewhere else.
      </p>

      <label className="mt-4 block text-sm">
        <span className="font-medium text-slate-700">Your goal</span>
        <input
          type="text"
          value={text}
          onChange={(event) => readSentence(event.target.value)}
          placeholder="e.g. Save R10 000 by December"
          className={fieldClass}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {understood.length > 0 ? (
          <>
            <span className="text-slate-500">Read as:</span>
            {understood.map((words) => (
              <span key={words} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 ring-1 ring-brand-200">
                {words}
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-slate-500">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => readSentence(example)}
                className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
              >
                {example}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {isFund ? (
          <div className="text-sm">
            <label className="block">
              <span className="font-medium text-slate-700">Emergency fund size</span>
              <select
                value={fundMonths}
                onChange={(event) => setFundMonths(Number(event.target.value))}
                className={fieldClass}
              >
                {[1, 2, 3, 4, 5, 6].map((months) => (
                  <option key={months} value={months}>
                    {months} month{months === 1 ? "" : "s"} of essentials
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setFundMonths(null)}
              className="mt-1 text-xs font-semibold text-brand-700 hover:underline"
            >
              Use an amount instead
            </button>
          </div>
        ) : (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Amount (R)</span>
            <input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={fieldClass}
            />
          </label>
        )}

        <div className="text-sm">
          <span className="font-medium text-slate-700">By the end of</span>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
            <select
              aria-label="Month"
              value={deadline.month}
              onChange={(event) => {
                setDeadline({ ...deadline, month: Number(event.target.value) });
                setDeadlineAssumed(false);
              }}
              className={cn(fieldClass, "mt-0")}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={deadline.year}
              onChange={(event) => {
                setDeadline({ ...deadline, year: Number(event.target.value) });
                setDeadlineAssumed(false);
              }}
              className={cn(fieldClass, "mt-0")}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {deadlineAssumed && <p className="mt-1 text-xs text-amber-700">No date given, so a year from now is assumed.</p>}
        </div>

        {isFund ? (
          <div className="text-sm">
            <span className="font-medium text-slate-700">Savings you already have</span>
            <p className="glass-outline mt-1 rounded-lg px-3 py-2 tabular-nums text-slate-900">{formatZAR(plan.savings)}</p>
            <p className="mt-1 text-xs text-slate-500">From your financial profile.</p>
          </div>
        ) : (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Already put aside (R)</span>
            <input
              type="number"
              min="0"
              step="100"
              inputMode="decimal"
              value={saved}
              placeholder="0"
              onChange={(event) => setSaved(event.target.value)}
              className={fieldClass}
            />
          </label>
        )}
      </div>

      {isFund && plan.essentialsTotal <= 0 && (
        <p className="mt-4 text-sm text-amber-800">
          An emergency fund is measured in months of essentials. Enter what you pay every month above first.
        </p>
      )}
      {!isFund && !ready && <p className="mt-4 text-sm text-slate-500">Enter an amount, or describe the goal above.</p>}

      {result && (
        <div className="mt-5 space-y-4 border-t border-slate-200/70 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", verdictTone[result.verdict].chip)}>
                {verdictTone[result.verdict].label}
              </span>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{result.headline}</h3>
              <p className="mt-1 max-w-prose text-sm text-slate-700">{result.summary}</p>
            </div>
            {result.months > 0 && result.stillToSave > 0 && (
              <div className="shrink-0 sm:text-right">
                <p className="text-3xl font-bold tracking-tight tabular-nums text-slate-900">{formatZAR(result.monthly)}</p>
                <p className="text-xs text-slate-600">
                  a month for {result.months} month{result.months === 1 ? "" : "s"}, to {monthLabel(deadline)}
                </p>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The calculation</p>
              <div className="mt-2">
                <WorkingTable lines={result.working} />
              </div>
            </div>

            {result.sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where it comes from</p>
                <ul className="mt-2 space-y-2">
                  {result.sources.map((source) => (
                    <li key={source.key} className="glass-outline rounded-lg p-3">
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium text-slate-900">{source.label}</span>
                        <span className="shrink-0 font-semibold tabular-nums text-slate-900">{formatZAR(source.amount)}</span>
                      </div>
                      {source.cost && <p className="mt-0.5 text-xs text-slate-500">{source.cost}</p>}
                      {source.note && <p className="mt-0.5 text-xs text-slate-500">{source.note}</p>}
                    </li>
                  ))}
                </ul>

                {result.debtImpact && result.debtImpact.monthsBefore !== null && (
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="glass-outline rounded-lg p-3">
                      <p className="text-xs text-slate-500">Debt-free, without this goal</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-slate-900">{durationLabel(result.debtImpact.monthsBefore)}</p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                      <p className="text-xs text-amber-800">With this goal</p>
                      <p className="mt-0.5 font-semibold tabular-nums text-amber-900">{durationLabel(result.debtImpact.monthsAfter)}</p>
                      {result.debtImpact.moreInterest > 0 && (
                        <p className="text-xs tabular-nums text-amber-800">+{formatZAR(result.debtImpact.moreInterest)} interest</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
