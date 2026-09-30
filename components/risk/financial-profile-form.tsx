"use client";

import Link from "next/link";
import { useState } from "react";
import { fieldErrors as toFieldErrors, financialProfileSchema } from "@/lib/risk/validation";

type Values = {
  monthlyIncome: string;
  monthlyExpenses: string;
  savings: string;
  financialGoal: string;
};

type Props = {
  initial: Values;
  initialEssentials: Record<string, string>;
  creditScore: number;
  hasActiveDebts: boolean;
};

const categories: Array<{ key: string; label: string; hint: string }> = [
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

function formatMoney(value: number | string): string {
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/R/gi, "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return `R${new Intl.NumberFormat("en-ZA", {
    maximumFractionDigits: 2,
    minimumFractionDigits: numeric % 1 === 0 ? 0 : 2
  }).format(numeric)}`;
}

function rawMoney(value: string): string {
  return value.replace(/R/gi, "").replace(/,/g, "").replace(/\s/g, "");
}

export function FinancialProfileForm({ initial, initialEssentials, creditScore, hasActiveDebts }: Props) {
  const [values, setValues] = useState<Values>({
    monthlyIncome: initial.monthlyIncome ? formatMoney(initial.monthlyIncome) : "",
    monthlyExpenses: initial.monthlyExpenses ? formatMoney(initial.monthlyExpenses) : "",
    savings: initial.savings ? formatMoney(initial.savings) : "",
    financialGoal: initial.financialGoal
  });
  const [essentials, setEssentials] = useState<Record<string, string>>(
    Object.fromEntries(categories.map((category) => [category.key, initialEssentials[category.key] ? formatMoney(initialEssentials[category.key]) : ""]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const update = (name: keyof Values, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: "" }));
  };

  const updateMoney = (name: "monthlyIncome" | "monthlyExpenses" | "savings", value: string) => {
    update(name, rawMoney(value));
  };

  const formatOnBlur = (name: "monthlyIncome" | "monthlyExpenses" | "savings") => {
    const numeric = Number(rawMoney(values[name]));
    if (Number.isFinite(numeric) && numeric >= 0) {
      setValues((current) => ({ ...current, [name]: formatMoney(numeric) }));
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);

    const local = financialProfileSchema.safeParse(values);
    if (!local.success) {
      setErrors(toFieldErrors(local.error));
      setStatus({ tone: "error", message: "Please correct the highlighted fields." });
      return;
    }

    setSaving(true);
    try {
      const profileResponse = await fetch("/api/financial-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      const profilePayload = (await profileResponse.json().catch(() => ({}))) as {
        message?: string;
        fieldErrors?: Record<string, string>;
      };

      if (!profileResponse.ok) {
        setErrors(profilePayload.fieldErrors ?? {});
        setStatus({ tone: "error", message: profilePayload.message ?? "Your financial profile could not be saved." });
        return;
      }

      const budgetResponse = await fetch("/api/money-plan", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          essentials: categories
            .map((category) => ({
              category: category.key,
              amount: Number(rawMoney(essentials[category.key] ?? "")) || 0
            }))
            .filter((item) => item.amount > 0)
        })
      });
      const budgetPayload = (await budgetResponse.json().catch(() => ({}))) as { message?: string };

      if (!budgetResponse.ok) {
        setStatus({
          tone: "error",
          message: budgetPayload.message ?? "Your financial profile was saved, but the essential expenses could not be saved."
        });
        return;
      }

      setErrors({});
      if (hasActiveDebts) {
        setStatus({ tone: "success", message: "Your financial information and monthly essentials have been saved." });
      } else {
        setStatus({
          tone: "warning",
          message: "Information saved. Add your debts and liabilities before requesting a Financial Risk Assessment for a comprehensive result."
        });
      }
    } catch {
      setStatus({ tone: "error", message: "Your financial information could not be saved. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const moneyInput = (
    name: "monthlyIncome" | "monthlyExpenses" | "savings",
    label: string,
    hint: string,
    required: boolean
  ) => (
    <label className="text-sm">
      <span className="mb-1 block font-medium text-slate-700">
        {label}{required ? <span className="text-rose-600"> *</span> : null}
      </span>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        value={values[name]}
        onChange={(event) => updateMoney(name, event.target.value)}
        onFocus={() => setValues((current) => ({ ...current, [name]: rawMoney(current[name]) }))}
        onBlur={() => formatOnBlur(name)}
        placeholder="e.g. R35,000"
        required={required}
        aria-invalid={Boolean(errors[name])}
        className={`w-full rounded-lg border px-3 py-2 ${errors[name] ? "border-red-400 bg-red-50" : "border-slate-300"}`}
      />
      {errors[name] ? (
        <span className="mt-1 block text-xs text-red-600">{errors[name]}</span>
      ) : (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );

  return (
    <form onSubmit={save} noValidate className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Financial information</h2>
        <p className="text-sm text-slate-500">
          Enter the figures you want FinAware to use for your risk assessment. Rand amounts accept formats such as R35,000.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {moneyInput("monthlyIncome", "Monthly income (R)", "Take-home income per month", true)}
        {moneyInput("monthlyExpenses", "Monthly expenses (R)", "Your overall living expenses", true)}
        {moneyInput("savings", "Savings (R)", "Total savings you can access", true)}

        <div className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Current Credit Score</span>
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              {creditScore > 0 ? creditScore : "Not available"}
            </span>
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
              {creditScore > 0 ? "Calculated" : "Pending"}
            </span>
          </div>
          <span className="mt-1 block text-xs text-slate-500">
            Calculated from recorded debt accounts and payment history. It is not entered manually.
          </span>
        </div>

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

      <div className="border-t border-slate-200 pt-5">
        <h2 className="text-lg font-semibold text-slate-900">Monthly essentials</h2>
        <p className="mt-1 text-sm text-slate-500">
          These fields were previously in Money Coach. They now belong to your Financial Profile and are saved with your profile.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {categories.map((category) => (
            <label key={category.key} className="text-sm">
              <span className="mb-1 block font-medium text-slate-700">{category.label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={essentials[category.key] ?? ""}
                onChange={(event) =>
                  setEssentials((current) => ({ ...current, [category.key]: rawMoney(event.target.value) }))
                }
                onFocus={() =>
                  setEssentials((current) => ({ ...current, [category.key]: rawMoney(current[category.key] ?? "") }))
                }
                onBlur={() => {
                  const numeric = Number(rawMoney(essentials[category.key] ?? ""));
                  if (Number.isFinite(numeric) && numeric > 0) {
                    setEssentials((current) => ({ ...current, [category.key]: formatMoney(numeric) }));
                  }
                }}
                placeholder="e.g. R5,000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-slate-500">{category.hint}</span>
            </label>
          ))}
        </div>
      </div>

      {status && (
        <div
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            status.tone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : status.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {status.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Financial Information"}
        </button>

        {status?.tone === "warning" && (
          <Link
            href="/debts"
            className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50"
          >
            Add Debts &amp; Liabilities →
          </Link>
        )}

        {status?.tone === "success" && (
          <Link
            href="/risk-assessment"
            className="rounded-lg border border-brand-600 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            Request Risk Assessment →
          </Link>
        )}

        {(status?.tone === "success" || status?.tone === "warning") && (
          <Link
            href="/dashboard"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Back to Dashboard
          </Link>
        )}
      </div>
    </form>
  );
}
