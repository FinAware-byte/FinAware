"use client";

import { useMemo, useState } from "react";
import { forecastCashflow } from "@/lib/budget/cashflow";
import type { EssentialItem, MoneyPlan } from "@/lib/budget/plan";
import { formatZAR, ordinal } from "@/lib/format";
import { cn } from "@/lib/utils";

// The next three months of the account, day by day. Driven by the plan on screen, so changing an
// essential above moves the line. The balance today is the one thing the app cannot know, so it
// is asked for and never stored.

const fieldClass =
  "glass-outline mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

const shortDate = (date: Date) => date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
const longDate = (date: Date) => date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });

type Props = { plan: Pick<MoneyPlan, "monthlyIncome" | "debts"> & { essentials: EssentialItem[] } };

function BalanceChart({ balances, paydayIndexes, lowestIndex, monthStarts }: {
  balances: number[];
  paydayIndexes: number[];
  lowestIndex: number;
  monthStarts: Array<{ index: number; label: string }>;
}) {
  const width = 600;
  const height = 160;
  const top = Math.max(0, ...balances);
  const bottom = Math.min(0, ...balances);
  const span = top - bottom || 1;
  const x = (i: number) => (i / Math.max(1, balances.length - 1)) * width;
  const y = (value: number) => 8 + ((top - value) / span) * (height - 24);
  const line = balances.map((value, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const zero = y(0);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" role="img" aria-label="Projected balance, day by day">
      <defs>
        <clipPath id="below-zero">
          <rect x="0" y={zero} width={width} height={height - zero} />
        </clipPath>
      </defs>
      {monthStarts.map((month) => (
        <g key={month.index}>
          <line x1={x(month.index)} x2={x(month.index)} y1="0" y2={height - 14} className="stroke-slate-200" strokeWidth="1" />
          <text x={x(month.index) + 3} y={height - 3} className="fill-slate-400 text-[10px]">
            {month.label}
          </text>
        </g>
      ))}
      {paydayIndexes.map((index) => (
        <line key={index} x1={x(index)} x2={x(index)} y1="0" y2={height - 14} className="stroke-emerald-300" strokeDasharray="3 3" />
      ))}
      <line x1="0" x2={width} y1={zero} y2={zero} className="stroke-slate-400" strokeWidth="1" />
      <path d={line} fill="none" className="stroke-brand-600" strokeWidth="2" strokeLinejoin="round" />
      <path d={line} fill="none" className="stroke-rose-600" strokeWidth="2.5" clipPath="url(#below-zero)" />
      <circle cx={x(lowestIndex)} cy={y(balances[lowestIndex])} r="4" className={balances[lowestIndex] < 0 ? "fill-rose-600" : "fill-brand-600"} />
    </svg>
  );
}

export function CashflowForecast({ plan }: Props) {
  const [balance, setBalance] = useState("");
  const [payday, setPayday] = useState(25);
  const today = useMemo(() => new Date(), []);

  const opening = Number(balance);
  const ready = balance.trim() !== "" && Number.isFinite(opening);

  const forecast = useMemo(
    () =>
      ready
        ? forecastCashflow({
            today,
            openingBalance: opening,
            payday,
            monthlyIncome: plan.monthlyIncome,
            essentials: plan.essentials,
            debts: plan.debts
          })
        : null,
    [ready, today, opening, payday, plan]
  );

  const upcoming = forecast
    ? forecast.days
        .filter((day) => day.date.getTime() - today.getTime() < 35 * 86_400_000)
        .flatMap((day) => day.events.filter((event) => event.amount < 0).map((event) => ({ date: day.date, ...event })))
    : [];

  return (
    <section className="glass-panel rounded-2xl border border-white/60 p-6">
      <h2 className="text-lg font-semibold text-slate-900">The next three months, day by day</h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-600">
        A month can balance and your account still run dry, if debit orders land before payday. Tell FinAware what is in
        your account today and it will show where the balance goes — and the first day it would run short.
      </p>

      <div className="mt-4 grid max-w-md gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">In your account today (R)</span>
          <input
            type="number"
            inputMode="decimal"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="e.g. 2500"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Payday</span>
          <select value={payday} onChange={(event) => setPayday(Number(event.target.value))} className={fieldClass}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d === 31 ? "Last day of the month" : `The ${ordinal(d)}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">Used only for this forecast. It is not saved.</p>

      {forecast && (
        <div className="mt-5 space-y-4">
          <div
            className={cn(
              "rounded-xl border p-4",
              forecast.firstShort ? "border-rose-200 bg-rose-50/70" : "border-emerald-200 bg-emerald-50/60"
            )}
          >
            {forecast.firstShort ? (
              <>
                <p className="text-base font-semibold text-rose-900">
                  You would run short on {longDate(forecast.firstShort.date)}
                </p>
                <p className="mt-1 text-sm text-rose-900">
                  The balance goes to {formatZAR(forecast.firstShort.balance)}
                  {forecast.firstShort.daysToPayday !== null && forecast.firstShort.daysToPayday > 0
                    ? `, ${forecast.firstShort.daysToPayday} day${forecast.firstShort.daysToPayday === 1 ? "" : "s"} before payday`
                    : ""}
                  . At its lowest it reaches {formatZAR(forecast.lowest.balance)} on {shortDate(forecast.lowest.date)}. Moving a debit order to
                  the day after payday, or keeping that amount back, closes the gap.
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-emerald-900">Your balance stays above zero</p>
                <p className="mt-1 text-sm text-emerald-900">
                  The lowest point is {formatZAR(forecast.lowest.balance)} on {longDate(forecast.lowest.date)}.
                </p>
              </>
            )}
          </div>

          <BalanceChart
            balances={forecast.days.map((day) => day.balance)}
            paydayIndexes={forecast.paydays
              .map((payday) => forecast.days.findIndex((day) => day.date.toDateString() === payday.toDateString()))
              .filter((index) => index >= 0)}
            lowestIndex={forecast.days.findIndex((day) => day.date.toDateString() === forecast.lowest.date.toDateString())}
            monthStarts={forecast.days
              .map((day, index) => ({ day, index }))
              .filter(({ day, index }) => index === 0 || day.date.getDate() === 1)
              .map(({ day, index }) => ({ index, label: day.date.toLocaleDateString("en-ZA", { month: "short" }) }))}
          />
          <p className="-mt-2 text-xs text-slate-500">Dashed green lines are paydays. The line turns red below zero.</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Month</th>
                    <th className="py-1.5 pr-3 text-right font-medium">In</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Out</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Lowest</th>
                    <th className="py-1.5 text-right font-medium">End</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70 tabular-nums">
                  {forecast.months.map((month) => (
                    <tr key={month.label}>
                      <td className="py-1.5 pr-3 text-slate-800">{month.label}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-700">{formatZAR(month.moneyIn)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-700">{formatZAR(month.moneyOut)}</td>
                      <td className={cn("py-1.5 pr-3 text-right", month.runsShort ? "font-semibold text-rose-700" : "text-slate-700")}>
                        {formatZAR(month.lowest)}
                      </td>
                      <td className="py-1.5 text-right font-medium text-slate-900">{formatZAR(month.closing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Going out on set days, next five weeks</p>
              {upcoming.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">None.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-200/70 text-sm">
                  {upcoming.map((event, index) => (
                    <li key={`${event.label}-${index}`} className="flex justify-between gap-3 py-1.5">
                      <span className="text-slate-700">
                        <span className="tabular-nums text-slate-500">{shortDate(event.date)}</span> · {event.label}
                      </span>
                      <span className="tabular-nums text-slate-900">{formatZAR(-event.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <ul className="space-y-0.5 text-xs text-slate-500">
            {forecast.assumptions.map((line) => (
              <li key={line}>• {line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
