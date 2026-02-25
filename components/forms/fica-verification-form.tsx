"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type FicaVerificationFormProps = {
  nextPath: string;
};

export function FicaVerificationForm({ nextPath }: FicaVerificationFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useDemoPlaceholder, setUseDemoPlaceholder] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const payload = new FormData(form);

    setPending(true);
    try {
      const response = await fetch("/api/microservices/auth/fica/verify", {
        method: "POST",
        body: payload
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as { message?: string };
        setError(parsed.message ?? "Unable to complete FICA verification.");
        return;
      }

      const target = nextPath.startsWith("/") ? nextPath : "/dashboard";
      router.replace(target);
      router.refresh();
    } catch {
      setError("Unable to submit documents right now. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="glass-panel mt-6 space-y-4 rounded-2xl border border-white/40 bg-white/70 p-6"
    >
      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="identityDocument">
          Identity document (PDF/JPG/PNG)
        </label>
        <input
          id="identityDocument"
          name="identityDocument"
          type="file"
          accept=".pdf,image/jpeg,image/png"
          className="mt-1 w-full rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-sm"
          required={!useDemoPlaceholder}
          disabled={useDemoPlaceholder}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="proofOfAddress">
          Proof of address (not older than 3 months)
        </label>
        <input
          id="proofOfAddress"
          name="proofOfAddress"
          type="file"
          accept=".pdf,image/jpeg,image/png"
          className="mt-1 w-full rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-sm"
          required={!useDemoPlaceholder}
          disabled={useDemoPlaceholder}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="bankStatement">
          Optional: bank statement
        </label>
        <input
          id="bankStatement"
          name="bankStatement"
          type="file"
          accept=".pdf,image/jpeg,image/png"
          className="mt-1 w-full rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-sm"
          disabled={useDemoPlaceholder}
        />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-white/40 bg-white/70 p-3 text-sm text-slate-700">
        <input
          id="useDemoPlaceholder"
          name="useDemoPlaceholder"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300"
          checked={useDemoPlaceholder}
          onChange={(event) => setUseDemoPlaceholder(event.target.checked)}
        />
        <span>
          Use demo placeholder FICA documents for this prototype run (no real document upload).
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-white/40 bg-white/70 p-3 text-sm text-slate-700">
        <input
          id="consentAccepted"
          name="consentAccepted"
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-slate-300"
          required
        />
        <span>
          I consent to FinAware processing these demo FICA documents for verification and
          simulation purposes.
        </span>
      </label>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Submitting verification..." : "Complete Verification"}
      </button>
    </form>
  );
}
