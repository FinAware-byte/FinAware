"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/card";
import { cn } from "@/lib/utils";

// Second model: predicts a recorded outcome (a missed payment), not the constructed risk tier.
// It loads on its own after the page renders, so a slow or unavailable model never delays or
// breaks the risk assessment above it.

type Driver = {
  feature: string;
  label: string;
  value: string | number;
  direction: "increases_risk" | "reduces_risk";
  importance: number;
};

type DebtOutlook = {
  debtId: number | null;
  creditor: string | null;
  probability: number;
  band: "Low" | "Moderate" | "High";
  flagged: boolean;
  topDrivers: Driver[];
};

type Outlook =
  | { available: false; reason?: string; paymentsOnRecord?: number }
  | {
      available: true;
      paymentsOnRecord: number;
      anyMissedProbability: number;
      band: "Low" | "Moderate" | "High";
      decisionThreshold: number;
      debts: DebtOutlook[];
      model: { name: string; version: string; task: string; labelSource: string };
      holdoutMetrics: { roc_auc: number; average_precision: number; brier: number };
    };

const bandTone: Record<string, string> = {
  Low: "text-emerald-700",
  Moderate: "text-amber-700",
  High: "text-red-700"
};

const bandBar: Record<string, string> = {
  Low: "bg-emerald-500",
  Moderate: "bg-amber-500",
  High: "bg-red-500"
};

const missingHistory: Record<string, string> = {
  NOT_ENOUGH_HISTORY: "You need at least three recorded payments before this can be estimated.",
  NO_DEBTS: "You have no debts on record, so there is no upcoming payment to assess.",
  NO_INCOME: "A monthly income is needed to compare your debt balances against."
};

function percent(value: number): number {
  return Math.round(value * 100);
}

export function PaymentOutlook() {
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/payment-outlook", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: Outlook) => active && setOutlook(data))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Payment reliability</h3>
        <p className="mt-1 text-sm text-slate-600">
          This estimate is unavailable right now. Your risk assessment above is unaffected.
        </p>
      </Card>
    );
  }

  if (!outlook) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Payment reliability</h3>
        <p className="mt-1 text-sm text-slate-500">Estimating…</p>
      </Card>
    );
  }

  if (!outlook.available) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Payment reliability</h3>
        <p className="mt-1 text-sm text-slate-600">
          {missingHistory[outlook.reason ?? ""] ?? "There is not enough payment history to estimate this yet."}
        </p>
      </Card>
    );
  }

  const chance = percent(outlook.anyMissedProbability);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Payment reliability</h3>
          <p className="text-xs text-slate-500">
            Learned from your {outlook.paymentsOnRecord} recorded payments — a separate model from the risk tier above.
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-3xl font-bold", bandTone[outlook.band])}>{chance}%</p>
          <p className="text-xs text-slate-500">chance of missing a payment</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {outlook.debts.map((debt) => (
          <div key={debt.debtId ?? debt.creditor} className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-900">{debt.creditor ?? "This debt"}</p>
              <span className={cn("text-sm font-semibold", bandTone[debt.band])}>{percent(debt.probability)}%</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className={cn("h-full", bandBar[debt.band])} style={{ width: `${Math.max(2, percent(debt.probability))}%` }} />
            </div>
            {debt.topDrivers[0] && (
              <p className="mt-2 text-xs text-slate-500">
                Mainly {debt.topDrivers[0].label.toLowerCase()} ({String(debt.topDrivers[0].value)}),{" "}
                {debt.topDrivers[0].direction === "increases_risk" ? "raising" : "lowering"} the estimate
              </p>
            )}
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        {outlook.model.name} v{outlook.model.version}, trained on recorded payment outcomes rather than a constructed
        label. On unseen later payments it scored ROC AUC {outlook.holdoutMetrics.roc_auc} — better than chance, but far
        from certain, so treat this as a prompt to check your dates, not a prediction of what will happen.{" "}
        <Link href="/about-the-model" className="font-semibold text-brand-700 hover:underline">
          How this model works
        </Link>
      </p>
    </Card>
  );
}
