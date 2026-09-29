"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CashflowForecast } from "@/components/budget/cashflow-forecast";
import { GoalPlanner } from "@/components/budget/goal-planner";
import { StatementImport } from "@/components/budget/statement-import";
import { formatZAR } from "@/lib/format";
import type { MoneyPlan, EssentialCategory, EssentialItem } from "@/lib/budget/plan";
import { cn } from "@/lib/utils";

// The money plan recalculates as the figures change, so the advice always describes the numbers
// on screen rather than the ones last saved. Typing previews; only "Save" writes anything.

type PlanResponse = MoneyPlan & { essentials: EssentialItem[]; savingsKnown: boolean };

const categories: { key: EssentialCategory; label: string; hint: string }[] = [
  { key: "housing", label: "Rent or bond", hint: "What you pay to keep a roof over your head" },
  { key: "groceries", label: "Groceries", hint: "Food and household basics" },
  { key: "transport", label: "Transport", hint: "Taxi, fuel, train or car payment" },
  { key: "utilities", label: "Electricity, water and data", hint: "Prepaid or monthly accounts" },
  { key: "healthcare", label: "Healthcare", hint: "Medical aid, medication, doctor visits" },
  { key: "insurance", label: "Insurance", hint: "Funeral cover, life, household" },
  { key: "education", label: "School or studies", hint: "Fees, books, transport to school" },
  { key: "childcare", label: "Childcare or support", hint: "Crèche, aftercare, family you support" },
  { key: "other", label: "Other essentials", hint: "Anything else you cannot skip" }
];

const statusTone: Record<MoneyPlan["status"], { text: string; label: string }> = {
  deficit: { text: "text-rose-700", label: "Short every month" },
  tight: { text: "text-amber-700", label: "Tight but workable" },
  healthy: { text: "text-emerald-700", label: "Room to restructure" }
};

const allocationTone: Record<string, string> = {
  breathing_room: "bg-slate-400",
  starter_buffer: "bg-sky-500",
  extra_debt: "bg-emerald-500",
  full_buffer: "bg-sky-500",
  long_term: "bg-indigo-500"
};

function monthsLabel(months: number | null): string {
  if (months === null) return "never, at this rate";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} year${years === 1 ? "" : "s"}` : `${years} yr ${rest} mo`;
}

const fieldClass =
  "glass-outline mt-1 w-full rounded-lg px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

export function MoneyPlanView({ initialGoal = "" }: { initialGoal?: string }) {
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [income, setIncome] = useState("");
  const [savedIncome, setSavedIncome] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const latestPreview = useRef(0);

  useEffect(() => {
    let active = true;
    fetch("/api/money-plan", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: PlanResponse) => {
        if (!active) return;
        setPlan(data);
        setAmounts(Object.fromEntries(data.essentials.map((item) => [item.category, String(item.amount)])));
        setIncome(String(data.monthlyIncome));
        setSavedIncome(data.monthlyIncome);
      })
      .catch(() => active && setError("Your money plan could not be loaded right now."));
    return () => {
      active = false;
    };
  }, []);

  const essentialsPayload = useCallback(
    () =>
      categories
        .map((category) => ({ category: category.key, amount: Number(amounts[category.key] ?? 0) }))
        .filter((item) => Number.isFinite(item.amount) && item.amount > 0),
    [amounts]
  );

  // Debounced preview: one request when typing settles, and a slow reply can never overwrite a
  // newer one.
  useEffect(() => {
    if (!dirty) return;
    const requestId = ++latestPreview.current;
    setRecalculating(true);

    const timer = setTimeout(async () => {
      try {
        const trialIncome = Number(income);
        const response = await fetch("/api/money-plan/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            essentials: essentialsPayload(),
            ...(Number.isFinite(trialIncome) && trialIncome > 0 ? { monthlyIncome: trialIncome } : {})
          })
        });
        const data = await response.json();
        if (requestId !== latestPreview.current) return;
        if (!response.ok) {
          setError(data.message ?? "Those figures could not be used.");
          return;
        }
        setPlan(data as PlanResponse);
        setError(null);
      } catch {
        if (requestId === latestPreview.current) setError("Those figures could not be used.");
      } finally {
        if (requestId === latestPreview.current) setRecalculating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [amounts, income, dirty, essentialsPayload]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/money-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ essentials: essentialsPayload() })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message ?? "Those amounts could not be saved.");
        return;
      }
      setPlan(data as PlanResponse);
      setDirty(false);
      setSavedAt(new Date().toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }));
    } catch {
      setError("Those amounts could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const enteredTotal = useMemo(
    () => categories.reduce((sum, category) => sum + (Number(amounts[category.key]) || 0), 0),
    [amounts]
  );

  const allocated = plan ? plan.allocations.reduce((sum, item) => sum + item.amount, 0) : 0;
  const trialIncome = Number(income);
  const incomeChanged = savedIncome !== null && Number.isFinite(trialIncome) && trialIncome !== savedIncome;

  return (
    <div className="space-y-4">
      <section className="glass-panel rounded-2xl border border-white/60 p-6">
        <h2 className="text-lg font-semibold text-slate-900">What do you have to pay every month?</h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Change any figure and the recommendation below updates as you type. Nothing is stored until you save.
        </p>

        <div className="mt-5 max-w-sm">
          <label htmlFor="budget-income" className="text-sm font-medium text-slate-800">
            Monthly income
          </label>
          <input
            id="budget-income"
            type="number"
            inputMode="decimal"
            min={0}
            step={100}
            value={income}
            onChange={(event) => {
              setIncome(event.target.value);
              setDirty(true);
            }}
            className={fieldClass}
            aria-describedby="budget-income-hint"
          />
          <p id="budget-income-hint" className="mt-1 text-xs text-slate-600">
            {incomeChanged
              ? `Trying ${formatZAR(trialIncome)} in place of the ${formatZAR(savedIncome ?? 0)} on your profile. This is not saved.`
              : "What you take home each month"}
          </p>
        </div>

        <StatementImport
          plan={plan}
          onApply={(essentials) => {
            setAmounts(
              Object.fromEntries(categories.map((category) => [category.key, essentials[category.key] > 0 ? String(essentials[category.key]) : ""]))
            );
            setDirty(true);
          }}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {categories.map((category) => (
            <div key={category.key}>
              <label htmlFor={`budget-${category.key}`} className="text-sm font-medium text-slate-800">
                {category.label}
              </label>
              <input
                id={`budget-${category.key}`}
                type="number"
                inputMode="decimal"
                min={0}
                step={50}
                value={amounts[category.key] ?? ""}
                onChange={(event) => {
                  setAmounts((current) => ({ ...current, [category.key]: event.target.value }));
                  setDirty(true);
                }}
                placeholder="0"
                className={fieldClass}
                aria-describedby={`budget-${category.key}-hint`}
              />
              <p id={`budget-${category.key}-hint`} className="mt-1 text-xs text-slate-600">
                {category.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-700">
            Essentials entered: <span className="font-semibold tabular-nums">{formatZAR(enteredTotal)}</span>
            {recalculating && <span className="ml-2 text-xs text-slate-500">updating…</span>}
          </p>
          <div className="flex items-center gap-3">
            {savedAt && !dirty && <span className="text-xs text-slate-500">Saved at {savedAt}</span>}
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="glass-button rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : dirty ? "Save these figures" : "Saved"}
            </button>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
      </section>

      {plan && (
        <>
          {/* The advice, named as such, directly under the figures that drive it. */}
          <section
            className={cn(
              "glass-panel rounded-2xl border p-6",
              plan.status === "deficit" ? "border-rose-300/70" : "border-emerald-300/70"
            )}
            aria-live="polite"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold tracking-wide text-white",
                  plan.status === "deficit" ? "bg-rose-600" : "bg-emerald-600"
                )}
              >
                Recommendation
              </span>
              {plan.status === "deficit" && plan.shortfall !== undefined && (
                <span className="text-sm font-semibold tabular-nums text-rose-700">
                  {formatZAR(plan.shortfall)} short each month
                </span>
              )}
            </div>

            <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">{plan.recommendation.headline}</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{plan.recommendation.summary}</p>

            {plan.recommendation.moves.length > 0 && (
              <ul className="mt-4 space-y-2">
                {plan.recommendation.moves.map((move) => (
                  <li
                    key={`${move.direction}-${move.label}`}
                    className="glass-outline flex flex-wrap items-start justify-between gap-x-4 gap-y-1 rounded-xl p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">
                        <span className={move.direction === "reduce" ? "text-rose-700" : "text-emerald-700"}>
                          {move.direction === "reduce" ? "Take away from" : "Put towards"}
                        </span>{" "}
                        {move.label}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-600">{move.reason}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "text-sm font-semibold tabular-nums",
                          move.direction === "reduce" ? "text-rose-700" : "text-emerald-700"
                        )}
                      >
                        {move.direction === "reduce" ? "−" : "+"}
                        {formatZAR(move.amount)}
                      </p>
                      {move.currentValue !== undefined && (
                        <p className="text-xs tabular-nums text-slate-500">
                          {formatZAR(move.currentValue)} → {formatZAR(move.currentValue - move.amount)}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {plan.recommendation.stillToFind > 0 && (
              <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-sm text-rose-800">
                Even after those changes,{" "}
                <span className="font-semibold tabular-nums">{formatZAR(plan.recommendation.stillToFind)}</span> a month
                still has to come from somewhere else — more income, or creditors agreeing to restructure what you
                repay. A budget cannot absorb it, so FinAware will not pretend otherwise.
              </p>
            )}
          </section>

          <section className="glass-panel rounded-2xl border border-white/60 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Where your money goes</h2>
                <p className="text-xs text-slate-500">Budget rules v{plan.rulesVersion} — the same figures every time.</p>
              </div>
              <p className={cn("text-sm font-semibold", statusTone[plan.status].text)}>{statusTone[plan.status].label}</p>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { label: "Income", value: plan.monthlyIncome },
                { label: "Essentials", value: plan.essentialsTotal },
                { label: "Debt minimums", value: plan.debtMinimumsTotal },
                { label: "Left to direct", value: plan.surplus }
              ].map((row) => (
                <div key={row.label} className="glass-outline rounded-xl p-3">
                  <dt className="text-xs text-slate-500">{row.label}</dt>
                  <dd
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      row.value < 0 ? "text-rose-700" : "text-slate-900"
                    )}
                  >
                    {formatZAR(row.value)}
                  </dd>
                </div>
              ))}
            </dl>

            {plan.status !== "deficit" && (
              <div className="mt-5 space-y-3">
                {plan.allocations.map((allocation) => (
                  <div key={allocation.key} className="glass-outline rounded-xl p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{allocation.label}</p>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{formatZAR(allocation.amount)}</p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200/70" aria-hidden="true">
                      <div
                        className={cn("h-full", allocationTone[allocation.key] ?? "bg-slate-400")}
                        style={{ width: `${allocated > 0 ? Math.max(2, (allocation.amount / allocated) * 100) : 0}%` }}
                      />
                    </div>
                    {allocation.target && <p className="mt-2 text-xs font-medium text-slate-700">To: {allocation.target}</p>}
                    {allocation.targetAmount !== undefined && (
                      <p className="mt-2 text-xs font-medium text-slate-700">Goal: {formatZAR(allocation.targetAmount)}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">{allocation.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {plan.assumptions.length > 0 && (
              <div className="glass-outline mt-4 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-700">How the monthly minimums were worked out</p>
                <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                  {plan.assumptions.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">
                  FinAware does not store how long you have left on a loan, so these use standard terms from today. Your
                  real instalment is on your statement — enter it on the debt to make the plan exact.
                </p>
              </div>
            )}

            {plan.warnings.length > 0 && (
              <ul className="mt-4 space-y-1 text-xs text-amber-800">
                {plan.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            )}
          </section>

          {plan.payoff && plan.payoff.monthsWithPlan !== null && (
            <section className="glass-panel rounded-2xl border border-white/60 p-6">
              <h2 className="text-lg font-semibold text-slate-900">What that does to your debt</h2>
              <p className="mt-1 text-xs text-slate-500">
                Both figures assume interest keeps running at today&apos;s rates and you make every payment.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="glass-outline rounded-xl p-3">
                  <p className="text-xs text-slate-500">Paying only the minimums</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                    {monthsLabel(plan.payoff.monthsOnMinimums)}
                  </p>
                  <p className="text-xs tabular-nums text-slate-500">
                    {formatZAR(plan.payoff.interestOnMinimums)} in interest
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 backdrop-blur">
                  <p className="text-xs text-emerald-800">Following this plan</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
                    {monthsLabel(plan.payoff.monthsWithPlan)}
                  </p>
                  <p className="text-xs tabular-nums text-emerald-800">
                    {formatZAR(plan.payoff.interestWithPlan)} in interest
                  </p>
                </div>
              </div>
              {plan.payoff.interestSaved > 0 && (
                <p className="mt-3 text-sm text-slate-700">
                  That is <span className="font-semibold tabular-nums">{formatZAR(plan.payoff.interestSaved)}</span> less
                  interest
                  {plan.payoff.monthsSaved !== null && <> and {monthsLabel(plan.payoff.monthsSaved)} sooner</>}.
                </p>
              )}
            </section>
          )}

          <GoalPlanner plan={plan} initialText={initialGoal} />

          <CashflowForecast plan={plan} />

          <section className="glass-panel rounded-2xl border border-white/60 p-6">
            <h2 className="text-lg font-semibold text-slate-900">Helping your credit score</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              FinAware cannot predict what a bureau will score you. These are the behaviours that scores are built from,
              in the order that matters.
            </p>
            <ol className="mt-4 space-y-3">
              {plan.creditActions.map((action, index) => (
                <li key={action.title} className="glass-outline rounded-xl p-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {index + 1}. {action.title}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">{action.detail}</p>
                  <p className="mt-1 text-xs text-slate-500">Why: {action.why}</p>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
