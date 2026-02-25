"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  passportCountryRules,
  passportCountryValues,
  type PassportCountry
} from "@/lib/identification/rules";

type LandingFormProps = {
  submitLabel?: string;
  showLearnMore?: boolean;
  redirectTo?: string;
  mode?: "join" | "login";
};

export function LandingForm({
  submitLabel = "Join Now",
  showLearnMore = true,
  redirectTo = "/dashboard",
  mode = "join"
}: LandingFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [documentType, setDocumentType] = useState<"SA_ID" | "PASSPORT">("SA_ID");
  const [passportCountry, setPassportCountry] = useState<PassportCountry>("ZA");
  const isLogin = mode === "login";

  const pendingLabel = useMemo(() => {
    if (isLogin) return "Signing in...";
    return "Joining...";
  }, [isLogin]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const idNumberOrPassport = String(formData.get("idNumberOrPassport") ?? "")
      .trim()
      .toUpperCase();

    if (!idNumberOrPassport) {
      setError("ID/Passport is required.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/microservices/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idNumberOrPassport,
          documentType,
          passportCountry: documentType === "PASSPORT" ? passportCountry : null,
          authIntent: isLogin ? "login" : "join"
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? "Unable to sign in. Please try again.");
        return;
      }

      const destination = redirectTo.startsWith("/") ? redirectTo : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch {
      setError("Unable to reach the authentication service right now.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      id="auth-form"
      onSubmit={onSubmit}
      className="glass-panel mt-8 space-y-5 rounded-2xl border border-white/45 p-6 shadow-card"
    >
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Document Type</p>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/45 bg-white/62 p-1">
          <button
            type="button"
            onClick={() => {
              setDocumentType("SA_ID");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              documentType === "SA_ID"
                ? "bg-brand-600 text-white shadow"
                : "text-slate-700 hover:bg-white/70"
            }`}
          >
            South African ID
          </button>
          <button
            type="button"
            onClick={() => {
              setDocumentType("PASSPORT");
              setError(null);
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              documentType === "PASSPORT"
                ? "bg-brand-600 text-white shadow"
                : "text-slate-700 hover:bg-white/70"
            }`}
          >
            Passport
          </button>
        </div>
      </div>

      {documentType === "PASSPORT" ? (
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="passportCountry">
            Passport Country
          </label>
          <select
            id="passportCountry"
            name="passportCountry"
            value={passportCountry}
            onChange={(event) => {
              setPassportCountry(event.target.value as PassportCountry);
              setError(null);
            }}
            className="mt-1 w-full rounded-xl border border-white/45 bg-white/75 px-3 py-2 text-sm text-slate-800 outline-none ring-brand-500 transition focus:ring-2"
          >
            {passportCountryValues.map((code) => (
              <option key={code} value={code}>
                {passportCountryRules[code].label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium text-slate-700" htmlFor="idNumberOrPassport">
          {documentType === "SA_ID" ? "Enter SA ID Number" : "Enter Passport Number"}
        </label>
        <input
          id="idNumberOrPassport"
          name="idNumberOrPassport"
          type="text"
          inputMode={documentType === "SA_ID" ? "numeric" : "text"}
          maxLength={documentType === "SA_ID" ? 13 : 12}
          className="mt-1 w-full rounded-xl border border-white/45 bg-white/75 px-3 py-2 text-sm text-slate-900 outline-none ring-brand-500 transition focus:ring-2"
          placeholder={documentType === "SA_ID" ? "e.g. 9001015009087" : "e.g. A1234567"}
          required
        />
      </div>

      <div className="rounded-xl border border-white/40 bg-white/58 px-3 py-2 text-xs text-slate-600">
        {isLogin
          ? "Sign in with your existing demo profile. Use Join Now if you need a new profile."
          : "Joining creates a demo profile instantly and opens your financial dashboard."}
      </div>

      {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="cta-button glass-interactive rounded-xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          disabled={pending}
        >
          {pending ? pendingLabel : submitLabel}
        </button>

        {showLearnMore ? (
          <Link
            href="#learn-more"
            className="glass-button glass-interactive rounded-xl border border-white/45 bg-white/65 px-5 py-3 text-sm font-semibold text-slate-700"
          >
            Learn More
          </Link>
        ) : null}

        <Link
          href={isLogin ? "/join" : "/login"}
          className="glass-button glass-interactive rounded-xl border border-white/45 bg-white/65 px-5 py-3 text-sm font-semibold text-slate-700"
        >
          {isLogin ? "Join Now" : "Login"}
        </Link>
      </div>
    </form>
  );
}
