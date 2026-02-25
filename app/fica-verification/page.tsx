import { redirect } from "next/navigation";
import { FicaVerificationForm } from "@/components/forms/fica-verification-form";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

type FicaVerificationPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default async function FicaVerificationPage({ searchParams }: FicaVerificationPageProps) {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) {
    redirect("/login?next=/fica-verification");
  }

  const nextPath =
    searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "/dashboard";
  const result = await callServiceJson("auth", `/auth/users/${sessionUserId}`, {
    method: "GET"
  });
  const user = result.payload as {
    fullName?: string;
    idNumberOrPassport?: string;
    documentType?: "SA_ID" | "PASSPORT";
    passportCountry?: string | null;
    isFicaVerified?: boolean;
  };

  if (result.status < 200 || result.status >= 300) {
    redirect("/login");
  }

  if (user.isFicaVerified) {
    redirect(nextPath);
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-16 pt-10 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -left-24 top-8 h-80 w-80 rounded-full bg-blue-300/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -right-20 top-28 h-96 w-96 rounded-full bg-cyan-300/35 blur-3xl"
      />

      <section className="relative z-10 mx-auto w-full max-w-2xl">
        <div className="glass-panel rounded-3xl border border-white/40 p-8 shadow-card">
          <p className="inline-flex rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-700">
            FICA Verification Required
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            Upload your verification documents
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            To protect your profile, complete this verification step before accessing your financial
            dashboard. You can use the demo placeholder option if you do not have files available.
          </p>

          <div className="mt-4 rounded-xl border border-white/40 bg-white/75 p-4 text-sm text-slate-700">
            <p>
              <span className="font-semibold">User:</span> {user.fullName}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Document:</span> {user.documentType === "PASSPORT"
                ? `Passport (${user.passportCountry ?? "N/A"})`
                : "South African ID"}
            </p>
            <p className="mt-1">
              <span className="font-semibold">Number:</span> {user.idNumberOrPassport}
            </p>
          </div>

          <FicaVerificationForm nextPath={nextPath} />
        </div>
      </section>
    </main>
  );
}
