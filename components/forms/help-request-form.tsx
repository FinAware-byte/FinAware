"use client";

import { AssistanceType, ConsultationStatus, type AssistanceType as AssistanceTypeValue, type ConsultationStatus as ConsultationStatusValue } from "@/lib/domain";
import { useState } from "react";
import { formatDate } from "@/lib/format";

type ConsultationItem = {
  id: string;
  assistanceType: AssistanceTypeValue;
  status: ConsultationStatusValue;
  createdAt: string;
};

type Props = {
  initialRequests: ConsultationItem[];
  supportPhone: string;
  supportEmail: string;
};

export function HelpRequestForm({ initialRequests, supportPhone, supportEmail }: Props) {
  const [assistanceType, setAssistanceType] = useState<AssistanceTypeValue>(
    AssistanceType.FINANCIAL_ADVISOR
  );
  const [message, setMessage] = useState("");
  const [requests, setRequests] = useState(initialRequests);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/microservices/help/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistanceType, message })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Failed to submit request.");
      }

      const payload = (await response.json()) as {
        request: ConsultationItem;
        whatsappUrl: string;
      };

      setRequests((prev) => [payload.request, ...prev]);
      setMessage("");
      window.open(payload.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-lg font-semibold text-slate-900">Request a Consultation</h2>

          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Type of Assistance</span>
              <select
                value={assistanceType}
                onChange={(event) => setAssistanceType(event.target.value as AssistanceTypeValue)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value={AssistanceType.FINANCIAL_ADVISOR}>Financial Advisor</option>
                <option value={AssistanceType.DEBT_COUNSELLOR}>Debt Counsellor</option>
                <option value={AssistanceType.LEGAL_ADVISOR}>Legal Advisor</option>
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Describe your situation briefly...</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
          </div>

          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
          >
            {loading ? "Submitting..." : "Submit Request"}
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
          <h3 className="text-lg font-semibold text-slate-900">Request History</h3>
          <div className="mt-4 space-y-3">
            {requests.length === 0 && <p className="text-sm text-slate-500">No requests submitted yet.</p>}
            {requests.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-800">{item.assistanceType.replaceAll("_", " ")}</p>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {item.status === ConsultationStatus.PENDING ? "pending" : item.status.toLowerCase()}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{formatDate(new Date(item.createdAt))}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="rounded-xl border border-slate-200 bg-white p-6 shadow-card">
        <h3 className="text-lg font-semibold text-slate-900">Need urgent help?</h3>
        <p className="mt-3 text-sm text-slate-600">
          Reach our support desk immediately for urgent intervention.
        </p>
        <p className="mt-3 text-sm font-medium text-slate-800">
          Phone: {supportPhone}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-800">
          Email: {supportEmail}
        </p>
      </aside>
    </div>
  );
}
