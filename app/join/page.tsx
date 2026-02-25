import Image from "next/image";
import Link from "next/link";
import { LandingForm } from "@/components/forms/landing-form";

const outlook = [
  { label: "Now", current: 648, recommended: 648 },
  { label: "3M", current: 635, recommended: 678 },
  { label: "6M", current: 622, recommended: 714 }
];

const quickStats = [
  { label: "Identity + Risk", value: "Instant" },
  { label: "Debt Accounts", value: "2-8" },
  { label: "Consultation", value: "WhatsApp" }
];

const focusPoints = [
  "Secure session and private profile simulation",
  "Credit outlook: current behavior vs recommended plan",
  "Debt composition, risk factors, and guided human support"
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-16 pt-6 sm:px-8 lg:px-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 liquid-grid" />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -left-28 top-6 h-80 w-80 rounded-full bg-blue-300/45 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb-slow absolute -right-24 top-16 h-[28rem] w-[28rem] rounded-full bg-cyan-300/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute bottom-4 left-1/3 h-72 w-72 rounded-full bg-indigo-300/30 blur-3xl"
      />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-20">
        <Image
          src="/finaware-finance-scene.svg"
          alt=""
          fill
          className="object-cover object-center"
          priority
        />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-2xl border border-white/45 bg-white/55 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div>
          <p className="inline-flex rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-700">
            FinAware
          </p>
          <p className="mt-1 text-sm font-medium text-slate-600">Secure &amp; Private Financial Rehabilitation</p>
        </div>
        <Link
          href="/login"
          className="glass-button glass-interactive rounded-xl border border-white/45 bg-white/65 px-4 py-2 text-sm font-semibold text-slate-800"
        >
          Login
        </Link>
      </header>

      <section className="relative z-10 mx-auto mt-8 grid w-full max-w-7xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="space-y-6">
          <div className="glass-panel liquid-shell rounded-3xl border border-white/45 p-6 shadow-card sm:p-8">
            <p className="inline-flex rounded-full border border-white/45 bg-white/65 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-700">
              Finance Clarity
            </p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              See the truth of your finances today.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-slate-600">
              Understand your financial identity, get out of debt and take guided action with real human
              help when you need it.
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {quickStats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/45 bg-white/62 p-3 backdrop-blur-md">
                  <p className="text-[11px] uppercase tracking-[0.1em] text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                </div>
              ))}
            </div>

            <LandingForm submitLabel="Get Started Now" />
          </div>

          <div id="learn-more" className="glass-panel rounded-3xl border border-white/45 p-6 shadow-card sm:p-7">
            <h2 className="text-2xl font-semibold text-slate-900">Why FinAware</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {focusPoints.map((point) => (
                <div key={point} className="rounded-2xl border border-white/40 bg-white/58 p-4 text-sm text-slate-700">
                  {point}
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="glass-panel liquid-shell rounded-3xl border border-white/45 p-6 shadow-card sm:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Interactive Preview</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">Credit Outlook Simulator</h2>
            </div>
            <span className="rounded-full border border-emerald-300/60 bg-emerald-100/75 px-3 py-1 text-xs font-semibold text-emerald-700">
              Live Demo
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-white/45 bg-white/62 p-4">
            <p className="text-sm font-medium text-slate-700">Projected score: current vs recommended</p>
            <div className="mt-4 space-y-3">
              {outlook.map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span>{row.label}</span>
                    <span>
                      {row.current} / {row.recommended}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div className="h-2 rounded-full bg-slate-400" style={{ width: `${(row.current / 850) * 100}%` }} />
                  </div>
                  <div className="h-2 rounded-full bg-slate-200">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-cyan-500"
                      style={{ width: `${(row.recommended / 850) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/40 bg-white/60 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Debt Composition</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">By creditor, status, and debt type</p>
            </div>
            <div className="rounded-2xl border border-white/40 bg-white/60 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-slate-500">Rehabilitation Path</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Weekly actions + human support</p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
