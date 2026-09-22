"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RiskResult } from "@/components/risk/risk-result";
import { riskTone } from "@/lib/risk/format";
import type { ApiError, RiskAssessmentRecord, RiskAssessmentSummary } from "@/lib/risk/types";
import { cn } from "@/lib/utils";

type Props = {
  initialAssessment: RiskAssessmentRecord | null;
  history: RiskAssessmentSummary[];
};

export function RiskAssessmentPanel({ initialAssessment, history }: Props) {
  const router = useRouter();
  const [assessment, setAssessment] = useState(initialAssessment);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const requestAssessment = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/risk-assessment", { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as RiskAssessmentRecord | ApiError;
      if (!response.ok) {
        const err = payload as ApiError;
        setError({ error: err.error ?? "PREDICTION_FAILED", message: err.message ?? "The risk assessment could not be completed." });
        return;
      }
      setAssessment(payload as RiskAssessmentRecord);
      router.refresh();
    } catch {
      setError({ error: "PREDICTION_FAILED", message: "The risk assessment could not be completed. Please check your connection." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={requestAssessment}
          disabled={loading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {loading ? "Assessing your financial risk..." : assessment ? "Run a new assessment" : "Request risk assessment"}
        </button>
        <Link href="/financial-profile" className="text-sm font-semibold text-brand-700 hover:underline">
          Update financial information
        </Link>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <div>
            <p className="text-sm font-semibold text-red-800">
              {error.error === "PROFILE_REQUIRED" ? "Financial profile needed" : "We could not complete your risk assessment"}
            </p>
            <p className="text-sm text-red-700">{error.message}</p>
            <p className="mt-1 text-xs text-red-600">Nothing was saved.</p>
          </div>
          {error.error === "PROFILE_REQUIRED" ? (
            <Link href="/financial-profile" className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">
              Complete profile
            </Link>
          ) : (
            <button
              type="button"
              onClick={requestAssessment}
              disabled={loading}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Retry assessment
            </button>
          )}
        </div>
      )}

      {loading && !assessment && <p className="text-sm text-slate-500">Analysing your financial profile...</p>}

      {assessment ? (
        <div className={cn(loading && "opacity-60 transition")}>
          <RiskResult assessment={assessment} />
        </div>
      ) : (
        !loading &&
        !error && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
            No assessment yet. Request one to see your risk level, the factors influencing it and recommended actions.
          </p>
        )
      )}

      {history.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Assessment history</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Risk level</th>
                  <th className="py-2 pr-4">Risk score</th>
                  <th className="py-2">Model</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.assessmentId} className="border-t border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">
                      {new Date(row.predictionDate).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", riskTone[row.riskLevel].badge)}>
                        {row.riskLevel}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-slate-700">{Math.round(row.riskScore)} / 100</td>
                    <td className="py-2 text-slate-500">v{row.modelVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
