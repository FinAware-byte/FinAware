"use client";

import { EmploymentStatus, type EmploymentStatus as EmploymentStatusValue } from "@/lib/domain";
import { useFormState, useFormStatus } from "react-dom";
import { updateIdentity, type IdentityActionState } from "@/app/actions/identity";

const initialState: IdentityActionState = {};

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

type IdentityFormUser = {
  fullName: string;
  idNumberOrPassport: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  employmentStatus: EmploymentStatusValue;
  realAge: number;
  creditScore: number;
};

export function IdentityForm({ user }: { user: IdentityFormUser }) {
  const [state, action] = useFormState(updateIdentity, initialState);

  return (
    <form action={action} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Full Name</span>
          <input
            name="fullName"
            defaultValue={user.fullName}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">ID / Passport</span>
          <input
            value={user.idNumberOrPassport}
            disabled
            className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Bank Account Number (demo)</span>
          <input
            name="bankAccountNumber"
            defaultValue={user.bankAccountNumber ?? ""}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Monthly Income (R)</span>
          <input
            name="monthlyIncome"
            defaultValue={user.monthlyIncome}
            type="number"
            min={0}
            step="0.01"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Employment Status</span>
          <select
            name="employmentStatus"
            defaultValue={user.employmentStatus}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          >
            <option value={EmploymentStatus.EMPLOYED}>Employed</option>
            <option value={EmploymentStatus.UNEMPLOYED}>Unemployed</option>
            <option value={EmploymentStatus.SELF_EMPLOYED}>Self-Employed</option>
            <option value={EmploymentStatus.STUDENT}>Student</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Real Age</span>
          <input
            name="realAge"
            defaultValue={user.realAge}
            type="number"
            min={16}
            max={100}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Current Credit Score</span>
          <input
            name="creditScore"
            defaultValue={user.creditScore}
            type="number"
            min={300}
            max={900}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-slate-700">Saved Download Password (optional)</span>
          <input
            name="downloadPassword"
            type="password"
            placeholder="Set optional PDF password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.success && <p className="text-sm text-emerald-600">{state.success}</p>}

      <SaveButton />
    </form>
  );
}
