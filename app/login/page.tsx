import Link from "next/link";
import { redirect } from "next/navigation";
import { LandingForm } from "@/components/forms/landing-form";
import { getSessionUserId } from "@/lib/auth/session";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath =
    searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "/dashboard";
  const sessionUserId = getSessionUserId();

  if (sessionUserId) {
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
      <section className="relative z-10 mx-auto w-full max-w-xl">
        <div className="glass-panel rounded-3xl border border-white/40 p-8 shadow-card">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-700">
                FinAware
              </p>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Login to your dashboard</h1>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-white/45 bg-white/65 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white/80"
            >
              Back
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Enter your SA ID or Passport. New users are created automatically with demo data.
          </p>
          <LandingForm submitLabel="Login" showLearnMore={false} redirectTo={nextPath} mode="login" />
        </div>
      </section>
    </main>
  );
}
