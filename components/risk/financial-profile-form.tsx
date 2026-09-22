"use client";

import Link from "next/link";
import { useState } from "react";
import { fieldErrors as toFieldErrors, financialProfileSchema } from "@/lib/risk/validation";

type Values = {
  monthlyIncome: string;
  monthlyExpenses: string;
  savings: string;
  creditScore: string;
  financialGoal: string;
};

const fields: Array<{ name: keyof Values; label: string; hint: string; type: string; step?: string }> = [
  { name: "monthlyIncome", label: "Monthly income (R)", hint: "Take-home income per month", type: "number", step: "0.01" },
  { name: "monthlyExpenses", label: "Monthly expenses (R)", hint: "Living costs, excluding debt repayments", type: "number", step: "0.01" },
  { name: "savings", label: "Savings (R)", hint: "Total savings you can access", type: "number", step: "0.01" },
  { name: "creditScore", label: "Credit score", hint: "Between 300 and 850", type: "number", step: "1" }
];

export function FinancialProfileForm({ initial }: { initial: Values }) {
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (name: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    // Instant feedback in the browser; the Financial API Service re-validates and is authoritative.
    const local = financialProfileSchema.safeParse(values);
    if (!local.success) {
      setErrors(toFieldErrors(local.error));
      setStatus({ tone: "error", message: "Please correct the highlighted fields." });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/financial-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        fieldErrors?: Record<string, string>;
      };
      if (!response.ok) {
        setErrors(payload.fieldErrors ?? {});
        setStatus({ tone: "error", message: payload.message ?? "Your profile could not be saved." });
        return;
      }
      setErrors({});
      setStatus({ tone: "success", message: "Validation successful — your financial profile is saved." });
    } catch {
      setStatus({ tone: "error", message: "Your profile could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.name} className="text-sm">
            <span className="mb-1 block font-medium text-slate-700">{field.label}</span>
            <input
              name={field.name}
              type={field.type}
              step={field.step}
              inputMode="decimal"
              value={values[field.name]}
              onChange={(event) => update(field.name, event.target.value)}
              aria-invalid={Boolean(errors[field.name])}
              aria-describedby={`${field.name}-hint`}
              className={`w-full rounded-lg border px-3 py-2 ${errors[field.name] ? "border-red-400 bg-red-50" : "border-slate-300"}`}
            />
            {errors[field.name] ? (
              <span id={`${field.name}-hint`} className="mt-1 block text-xs text-red-600">
                {errors[field.name]}
              </span>
            ) : (
              <span id={`${field.name}-hint`} className="mt-1 block text-xs text-slate-500">
                {field.hint}
              </span>
            )}
          </label>
        ))}
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Financial goal (optional)</span>
          <input
            name="financialGoal"
            value={values.financialGoal}
            onChange={(event) => update("financialGoal", event.target.value)}
            placeholder="e.g. Build a 3-month emergency fund"
            className={`w-full rounded-lg border px-3 py-2 ${errors.financialGoal ? "border-red-400 bg-red-50" : "border-slate-300"}`}
          />
          {errors.financialGoal ? (
            <span className="mt-1 block text-xs text-red-600">{errors.financialGoal}</span>
          ) : (
            <span className="mt-1 block text-xs text-slate-500">Shown on your profile; it does not affect the risk assessment.</span>
          )}
        </label>
      </div>

      {status && (
        <p role="status" className={`text-sm ${status.tone === "success" ? "text-emerald-600" : "text-red-600"}`}>
          {status.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Validating..." : "Save financial information"}
        </button>
        {status?.tone === "success" && (
          <Link
            href="/risk-assessment"
            className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 transition hover:bg-brand-50"
          >
            Request risk assessment →
          </Link>
        )}
      </div>
    </form>
  );
}
