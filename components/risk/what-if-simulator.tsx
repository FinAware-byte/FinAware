"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/common/card";
import { formatZAR } from "@/lib/format";
import { riskTone, wholePercentages } from "@/lib/risk/format";
import type { MlFeaturePayload, RiskLevel } from "@/lib/risk/types";
import { cn } from "@/lib/utils";

// Lets the user move the things they control and watch the model respond. Every result comes from
// the same /predict the real assessment uses — nothing here is approximated in the browser — and
// none of it is stored, so the assessment history stays a record of what the user actually ran.

type Lever = {
  field: string;
  label: string;
  direction: "increase" | "decrease";
  currentValue: number;
  reachable: boolean;
  requiredValue?: number;
  change?: number;
  resultingLevel?: RiskLevel;
};

type WhatIf = { currentLevel: RiskLevel; targetLevel: RiskLevel | null; levers: Lever[] };

type SimulationResponse = {
  features: MlFeaturePayload;
  prediction: { riskLevel: RiskLevel; riskScore: number; probabilities: Record<RiskLevel, number> };
  whatIf: WhatIf | null;
};

type Adjustable = "monthly_expenses_zar" | "savings_zar" | "monthly_emi_zar";

const sliders: { field: Adjustable; label: string; hint: string }[] = [
  { field: "monthly_expenses_zar", label: "Monthly expenses", hint: "Living costs, excluding debt repayments" },
  { field: "savings_zar", label: "Savings", hint: "Total savings you can access" },
  { field: "monthly_emi_zar", label: "Monthly debt repayments", hint: "What you pay towards debts each month" }
];

const levels: RiskLevel[] = ["Low", "Medium", "High"];

// Ranges wide enough to cross a tier boundary without offering meaningless extremes.
function maxFor(field: Adjustable, baseline: MlFeaturePayload): number {
  if (field === "savings_zar") {
    return Math.max(baseline.savings_zar * 4, baseline.monthly_expenses_zar * 12, 200_000);
  }
  if (field === "monthly_expenses_zar") return Math.max(baseline.monthly_expenses_zar * 2, baseline.monthly_income_zar);
  return Math.max(baseline.monthly_emi_zar * 2, baseline.monthly_income_zar);
}

function step(max: number): number {
  return Math.max(100, Math.round(max / 200 / 100) * 100);
}

export function WhatIfSimulator() {
  // The baseline comes from the first unmodified call, so the sliders always start where the
  // user's saved profile actually sits rather than from anything reconstructed in the browser.
  const [baseline, setBaseline] = useState<MlFeaturePayload | null>(null);
  const [values, setValues] = useState<Record<Adjustable, number> | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const latestRequest = useRef(0);

  const run = useCallback(async (overrides: Record<Adjustable, number> | Record<string, never>) => {
    const requestId = ++latestRequest.current;
    setPending(true);
    try {
      const response = await fetch("/api/risk-simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides)
      });
      if (!response.ok) throw new Error(String(response.status));
      const data: SimulationResponse = await response.json();
      // Ignore a slow reply that a newer drag has already superseded.
      if (requestId === latestRequest.current) {
        setResult(data);
        setFailed(false);
        setBaseline((current) => current ?? data.features);
        setValues((current) =>
          current ?? {
            monthly_expenses_zar: data.features.monthly_expenses_zar,
            savings_zar: data.features.savings_zar,
            monthly_emi_zar: data.features.monthly_emi_zar
          }
        );
      }
    } catch {
      if (requestId === latestRequest.current) setFailed(true);
    } finally {
      if (requestId === latestRequest.current) setPending(false);
    }
  }, []);

  useEffect(() => {
    void run({});
  }, [run]);

  // Debounced: a drag produces one request when it settles, not one per pixel.
  useEffect(() => {
    if (!values) return;
    const timer = setTimeout(() => void run(values), 350);
    return () => clearTimeout(timer);
  }, [values, run]);

  if (failed && !result) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">What if things changed?</h3>
        <p className="mt-1 text-sm text-slate-600">
          The simulator is unavailable right now. Your saved assessment is unaffected.
        </p>
      </Card>
    );
  }

  if (!baseline || !values) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">What if things changed?</h3>
        <p className="mt-1 text-sm text-slate-500">Loading your figures…</p>
      </Card>
    );
  }

  const changed =
    values.monthly_expenses_zar !== baseline.monthly_expenses_zar ||
    values.savings_zar !== baseline.savings_zar ||
    values.monthly_emi_zar !== baseline.monthly_emi_zar;

  const percent = result ? wholePercentages(result.prediction.probabilities) : null;
  const tone = result ? riskTone[result.prediction.riskLevel] : null;
  const reachable = result?.whatIf?.levers.filter((lever) => lever.reachable) ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">What if things changed?</h3>
          <p className="text-xs text-slate-500">
            Move a slider to see how the model responds. Nothing here is saved to your assessment history.
          </p>
        </div>
        {result && tone && (
          <div className="text-right">
            <p className={cn("text-xl font-bold", tone.text)}>{result.prediction.riskLevel}</p>
            <p className="text-xs text-slate-500">
              score {Math.round(result.prediction.riskScore)} / 100{pending ? " · updating…" : ""}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {sliders.map(({ field, label, hint }) => {
          const max = maxFor(field, baseline);
          const value = values[field];
          const difference = value - baseline[field];
          return (
            <div key={field}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <label htmlFor={`sim-${field}`} className="text-sm font-medium text-slate-800">
                  {label}
                </label>
                <span className="text-sm font-semibold text-slate-900">
                  {formatZAR(value)}
                  {difference !== 0 && (
                    <span className={cn("ml-2 text-xs font-medium", difference > 0 ? "text-amber-700" : "text-emerald-700")}>
                      {difference > 0 ? "+" : "−"}
                      {formatZAR(Math.abs(difference))}
                    </span>
                  )}
                </span>
              </div>
              <input
                id={`sim-${field}`}
                type="range"
                min={0}
                max={max}
                step={step(max)}
                value={value}
                onChange={(event) =>
                  setValues((current) => (current ? { ...current, [field]: Number(event.target.value) } : current))
                }
                className="mt-2 w-full accent-brand-600"
                aria-describedby={`sim-${field}-hint`}
              />
              <p id={`sim-${field}-hint`} className="text-xs text-slate-500">
                {hint}
              </p>
            </div>
          );
        })}
      </div>

      {percent && (
        <div className="mt-5">
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
            {levels.map((level) => (
              <div key={level} className={riskTone[level].bar} style={{ width: `${percent[level]}%` }} />
            ))}
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {levels.map((level) => (
              <div key={level} className="flex items-center gap-2">
                <span className={cn("h-2.5 w-2.5 rounded-full", riskTone[level].bar)} />
                <dt className="text-slate-600">{level}</dt>
                <dd className="font-semibold text-slate-900">{percent[level]}%</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {result?.whatIf && !changed && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          {result.whatIf.targetLevel === null ? (
            <p className="text-sm text-slate-700">
              You are already in the lowest risk tier the model has.
            </p>
          ) : reachable.length > 0 ? (
            <>
              <p className="text-sm font-medium text-slate-900">
                What would move you to {result.whatIf.targetLevel} risk?
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">
                {reachable.map((lever) => (
                  <li key={lever.field}>
                    {lever.direction === "increase" ? "Increase" : "Reduce"} {lever.label.toLowerCase()} by{" "}
                    <span className="font-semibold">{formatZAR(lever.change ?? 0)}</span> (to{" "}
                    {formatZAR(lever.requiredValue ?? 0)})
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">
                Each figure changes that one thing on its own, with everything else held as it is today.
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-700">
              No single change within a realistic range moves you to {result.whatIf.targetLevel} on its own — it would
              take a combination.
            </p>
          )}
        </div>
      )}

      {failed && (
        <p className="mt-4 text-sm text-slate-600">
          The simulation is unavailable right now. Your saved assessment is unaffected.
        </p>
      )}
    </Card>
  );
}
