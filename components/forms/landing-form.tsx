"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

type LandingFormProps = {
  submitLabel?: string;
  showLearnMore?: boolean;
  redirectTo?: string;
  mode?: "join" | "login";
};

const idPassportRegex = /^[a-zA-Z0-9\-]+$/;

export function LandingForm({
  submitLabel = "Join Now",
  showLearnMore = true,
  redirectTo = "/dashboard",
  mode = "join"
}: LandingFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const isLogin = mode === "login";

  const pendingLabel = useMemo(() => {
    if (isLogin) return "Signing in...";
    return "Joining...";
  }, [isLogin]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const idNumberOrPassport = String(formData.get("idNumberOrPassport") ?? "").trim();

    if (idNumberOrPassport.length < 6 || idNumberOrPassport.length > 20) {
      setError("ID/Passport must be between 6 and 20 characters.");
      return;
    }

    if (!idPassportRegex.test(idNumberOrPassport)) {
      setError("Only letters, numbers, and hyphens are allowed.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/microservices/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idNumberOrPassport })
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
      className="glass-panel mt-8 space-y-4 rounded-2xl p-6 shadow-card"
    >
      <label className="block text-sm font-medium text-slate-700" htmlFor="idNumberOrPassport">
        Enter SA ID or Passport Number
      </label>
      <input
        id="idNumberOrPassport"
        name="idNumberOrPassport"
        type="text"
        className="w-full rounded-xl border border-white/40 bg-white/80 px-3 py-2 text-sm outline-none ring-brand-500 transition focus:ring-2"
        placeholder="e.g. 9001015009087 or A1234567"
        required
      />

      <p className="text-xs text-slate-600">
        {isLogin
          ? "No profile yet? Use Join Now to create a demo account instantly."
          : "FinAware creates your demo account instantly when you join."}
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          disabled={pending}
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        {showLearnMore ? (
          <Link
            href="#learn-more"
            className="rounded-xl border border-white/40 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/75"
          >
            Learn More
          </Link>
        ) : null}
        <Link
          href={isLogin ? "/" : "/login"}
          className="rounded-xl border border-white/40 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-white/75"
        >
          {isLogin ? "Join Now" : "Login"}
        </Link>
      </div>
    </form>
  );
}
