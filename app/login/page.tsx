import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LandingForm } from "@/components/forms/landing-form";
import { getFicaRequiredCookie, getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

type LoginPageProps = {
  searchParams?: {
    next?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const nextPath =
    searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "/dashboard";
  const sessionUserId = getSessionUserId();
  const ficaRequired = getFicaRequiredCookie() === "1";

  if (sessionUserId) {
    const result = await callServiceJson("auth", `/auth/users/${sessionUserId}`, {
      method: "GET"
    });
    if (result.status >= 200 && result.status < 300) {
      const payload = result.payload as { isFicaVerified?: boolean };
      if (ficaRequired && !payload.isFicaVerified) {
        redirect(`/fica-verification?next=${encodeURIComponent(nextPath)}`);
      }
      redirect(nextPath);
    }
  }

  return (
    <main className="login-tech-stage relative min-h-screen overflow-hidden px-5 pb-16 pt-8 sm:px-8 lg:px-10">
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -left-24 top-12 h-72 w-72 rounded-full bg-blue-300/45 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb-slow absolute -right-24 top-20 h-[26rem] w-[26rem] rounded-full bg-cyan-300/38 blur-3xl"
      />

      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="tech-particles absolute inset-0 opacity-80" />
        <div className="tech-scanlines absolute inset-0 opacity-35" />
        <div className="float-media absolute left-6 top-20 hidden w-72 rounded-2xl border border-white/50 bg-white/55 p-2 backdrop-blur-xl md:block">
          <Image
            src="/finaware-finance-scene.svg"
            alt=""
            width={420}
            height={280}
            className="h-auto w-full rounded-xl"
          />
        </div>
        <div className="float-media-delayed absolute bottom-16 right-8 hidden w-64 rounded-2xl border border-white/50 bg-white/52 p-2 backdrop-blur-xl lg:block">
          <Image
            src="/finaware-finance-scene.svg"
            alt=""
            width={360}
            height={240}
            className="h-auto w-full rounded-xl"
          />
        </div>
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-0 z-[12] hidden lg:block">
        <span className="concept-chip chip-delay-1 absolute left-6 top-24">Identity</span>
        <span className="concept-chip chip-delay-2 absolute left-16 top-44">Credit Score</span>
        <span className="concept-chip chip-alt chip-delay-3 absolute left-10 top-64">Risk Status</span>
        <span className="concept-chip chip-delay-4 absolute left-14 bottom-56">Debt Mix</span>
        <span className="concept-chip chip-alt chip-delay-5 absolute left-6 bottom-32">Income vs Expense</span>

        <span className="concept-chip chip-delay-2 absolute right-10 top-24">Monthly Plan</span>
        <span className="concept-chip chip-alt chip-delay-1 absolute right-20 top-44">Legal Check</span>
        <span className="concept-chip chip-delay-3 absolute right-8 top-64">Get Help</span>
        <span className="concept-chip chip-alt chip-delay-4 absolute right-12 bottom-56">Cashflow</span>
        <span className="concept-chip chip-delay-5 absolute right-20 bottom-32">Savings</span>
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-center">
        <div className="glass-panel liquid-shell w-full rounded-3xl border border-white/55 bg-white/74 p-6 shadow-card sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-700">
                FinAware
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Login to your dashboard</h2>
            </div>
            <Link
              href="/join"
              className="glass-button glass-interactive rounded-xl border border-white/65 bg-white/76 px-4 py-2 text-sm font-semibold text-slate-800"
            >
              Home
            </Link>
          </div>

          <p className="mt-3 text-sm text-slate-700">
            Enter your SA ID or Passport to sign in. If you do not have an account yet, use Join Now.
          </p>

          <LandingForm submitLabel="Login" showLearnMore={false} redirectTo={nextPath} mode="login" />
        </div>
      </section>
    </main>
  );
}
