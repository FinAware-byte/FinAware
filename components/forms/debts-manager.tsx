"use client";

import {
  DebtStatus,
  DebtType,
  type AppDebt,
  type DebtStatus as DebtStatusValue,
  type DebtType as DebtTypeValue
} from "@/lib/domain";
import { useMemo, useState } from "react";
import { formatZAR } from "@/lib/format";

type Props = {
  initialDebts: AppDebt[];
};

type DebtFormState = {
  creditorName: string;
  debtType: DebtTypeValue;
  interestRate: number;
  balance: number;
  status: DebtStatusValue;
};

const debtTypeOptions = Object.values(DebtType);
const debtStatusOptions = Object.values(DebtStatus);

export function DebtsManager({ initialDebts }: Props) {
  const [debts, setDebts] = useState<AppDebt[]>(initialDebts);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<DebtFormState>({
    creditorName: "",
    debtType: DebtType.CREDIT_CARD,
    interestRate: 16,
    balance: 0,
    status: DebtStatus.ACTIVE
  });

  const activeDebts = useMemo(() => debts.filter((item) => item.status === DebtStatus.ACTIVE), [debts]);

  const addDebt = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/microservices/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Could not add debt.");
      }

      const created = (await response.json()) as AppDebt;
      setDebts((prev) => [created, ...prev]);
      setShowModal(false);
      setForm({
        creditorName: "",
        debtType: DebtType.CREDIT_CARD,
        interestRate: 16,
        balance: 0,
        status: DebtStatus.ACTIVE
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add debt.");
    } finally {
      setLoading(false);
    }
  };

  const updateDebt = async (id: string, status: DebtStatusValue) => {
    setError(null);
    try {
      const response = await fetch(`/api/microservices/debts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Could not update debt.");
      }

      const updated = (await response.json()) as AppDebt;
      setDebts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update debt.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Debts &amp; Liabilities</h1>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Add New Debt
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-3">Creditor</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Interest</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Monthly Obligation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {activeDebts.map((debt) => (
              <DebtRow key={debt.id} debt={debt} onSave={updateDebt} />
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Add New Debt</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block">Creditor</span>
                <input
                  value={form.creditorName}
                  onChange={(event) => setForm((prev) => ({ ...prev, creditorName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Type</span>
                <select
                  value={form.debtType}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, debtType: event.target.value as DebtTypeValue }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {debtTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Interest Rate (%)</span>
                <input
                  type="number"
                  value={form.interestRate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, interestRate: Number(event.target.value) }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Balance</span>
                <input
                  type="number"
                  value={form.balance}
                  onChange={(event) => setForm((prev) => ({ ...prev, balance: Number(event.target.value) }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block">Status</span>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, status: event.target.value as DebtStatusValue }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  {debtStatusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addDebt}
                disabled={loading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {loading ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DebtRow({
  debt,
  onSave
}: {
  debt: AppDebt;
  onSave: (id: string, status: DebtStatusValue) => Promise<void>;
}) {
  const [status, setStatus] = useState<DebtStatusValue>(debt.status);

  return (
    <tr className="border-t border-slate-200">
      <td className="px-4 py-3">{debt.creditorName}</td>
      <td className="px-4 py-3">{debt.debtType.replaceAll("_", " ")}</td>
      <td className="px-4 py-3">{debt.interestRate.toFixed(2)}%</td>
      <td className="px-4 py-3">{formatZAR(debt.balance)}</td>
      <td className="px-4 py-3">{formatZAR(debt.monthlyObligation)}</td>
      <td className="px-4 py-3">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as DebtStatusValue)}
          className="rounded-md border border-slate-300 px-2 py-1"
        >
          {debtStatusOptions.map((option) => (
            <option key={option} value={option}>
              {option.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          onClick={() => onSave(debt.id, status)}
          className="rounded-md border border-brand-300 px-3 py-1 text-xs font-semibold text-brand-700"
        >
          Update
        </button>
      </td>
    </tr>
  );
}
