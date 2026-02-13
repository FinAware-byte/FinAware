import Image from "next/image";
import { LandingForm } from "@/components/forms/landing-form";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden px-5 pb-16 pt-6 sm:px-8">
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -left-24 top-8 h-80 w-80 rounded-full bg-blue-300/40 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute -right-20 top-28 h-96 w-96 rounded-full bg-cyan-300/35 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none liquid-orb absolute left-1/3 top-1/2 h-80 w-80 -translate-y-1/2 rounded-full bg-indigo-300/30 blur-3xl"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between">
        <div>
          <p className="inline-flex rounded-full bg-brand-100/80 px-3 py-1 text-xs font-semibold text-brand-700">FinAware</p>
          <p className="mt-2 text-sm font-medium text-slate-600">Secure &amp; Private Financial Rehabilitation</p>
        </div>
        <a
          href="/login"
          className="glass-button rounded-xl border border-white/40 bg-white/55 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-white/70"
        >
          Login
        </a>
      </div>

      <section className="relative z-10 mx-auto mt-8 grid w-full max-w-7xl gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
            See the truth of your finances today.
          </h1>
          <p className="mt-4 text-base text-slate-600">
            Understand your financial identity, get out of debt and take guided action with real human help
            when you need it.
          </p>
          <LandingForm />
        </div>
        <div className="glass-panel relative overflow-hidden rounded-3xl border border-white/35 bg-gradient-to-br from-brand-700/90 via-brand-600/85 to-cyan-600/80 p-8 text-white shadow-card">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-12 top-6 h-40 w-40 rounded-full bg-white/20 blur-2xl"
          />
          <h2 className="text-xl font-semibold">Your secure simulation starts here</h2>
          <ul className="mt-4 space-y-3 text-sm text-blue-50">
            <li>Simulated risk profile from your SA ID/Passport input.</li>
            <li>Color-coded debt dashboard with score trajectory modeling.</li>
            <li>Guided human support via WhatsApp click-to-chat.</li>
          </ul>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/35 bg-white/15 p-2 backdrop-blur-md">
            <Image
              src="/finaware-finance-scene.svg"
              alt="FinAware financial dashboard and security illustration"
              width={880}
              height={640}
              className="h-auto w-full rounded-lg"
              priority
            />
          </div>
        </div>
      </section>

      <section
        id="learn-more"
        className="glass-panel relative z-10 mx-auto mt-16 w-full max-w-7xl rounded-3xl border border-white/40 bg-white/55 p-8 shadow-card backdrop-blur-xl"
      >
        <h2 className="text-2xl font-semibold text-slate-900">Why FinAware</h2>
        <p className="mt-3 text-sm text-slate-600">
          FinAware is a simulated financial rehabilitation tool that helps you understand debt pressure,
          prioritize repayment actions, and request help from experts when necessary.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-white/40 bg-white/55 p-4 backdrop-blur-md">
            <h3 className="font-semibold text-slate-900">Private Login</h3>
            <p className="mt-1 text-sm text-slate-600">Session secured by server-side cookies.</p>
          </div>
          <div className="rounded-xl border border-white/40 bg-white/55 p-4 backdrop-blur-md">
            <h3 className="font-semibold text-slate-900">Financial Rehab</h3>
            <p className="mt-1 text-sm text-slate-600">AI-assisted suggestions plus practical weekly plans.</p>
          </div>
          <div className="rounded-xl border border-white/40 bg-white/55 p-4 backdrop-blur-md">
            <h3 className="font-semibold text-slate-900">Get Help</h3>
            <p className="mt-1 text-sm text-slate-600">Request a consultation and open WhatsApp instantly.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
