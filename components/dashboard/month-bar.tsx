import Link from "next/link";
import { formatZAR } from "@/lib/format";
import { cn } from "@/lib/utils";

// The month, in one line: what comes in, what debt takes, what is left to live on.
//
// This is the one place on the dashboard that moves. The bar grows from nothing on load, because
// the thing worth drawing the eye to is the proportion — how much of the month is already spoken
// for. Everything else on the page stays still.
//
// The motion is a CSS animation on markup that already holds its final values, which means the
// bar is correct before JavaScript runs, there is no flash of a wrong width on hydration, and
// prefers-reduced-motion is honoured by the stylesheet rather than by a hook.

type Props = {
  firstName: string;
  monthlyIncome: number;
  monthlyObligations: number;
  /** Injectable so the greeting can be tested without waiting for the clock. */
  now?: Date;
  /** Secondary actions, shown beside the main one so the page has a single action row. */
  children?: React.ReactNode;
};

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function pressureFor(share: number) {
  if (share >= 60) {
    return {
      label: "Most of your month is already spoken for",
      bar: "bg-rose-500",
      dot: "bg-rose-500",
      text: "text-rose-700"
    };
  }
  if (share >= 40) {
    return {
      label: "Debt takes a large share of your month",
      bar: "bg-amber-500",
      dot: "bg-amber-500",
      text: "text-amber-700"
    };
  }
  return {
    label: "Your debt payments still leave room to work with",
    bar: "bg-brand-600",
    dot: "bg-brand-600",
    text: "text-brand-700"
  };
}

export function MonthBar({ firstName, monthlyIncome, monthlyObligations, now, children }: Props) {
  const share = monthlyIncome > 0 ? Math.min(100, (monthlyObligations / monthlyIncome) * 100) : 0;
  const leftOver = Math.max(0, monthlyIncome - monthlyObligations);
  const percent = Math.round(share);
  const pressure = pressureFor(share);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
      <p className="text-sm text-slate-500">
        {greetingFor(now ?? new Date())}, {firstName}.
      </p>

      <h1 className="mt-2 max-w-2xl text-2xl font-semibold leading-snug tracking-tight text-slate-900 sm:text-3xl">
        {monthlyIncome > 0 ? (
          <>
            <span className="tabular-nums">{formatZAR(monthlyObligations)}</span> of your monthly{" "}
            <span className="tabular-nums">{formatZAR(monthlyIncome)}</span> goes to debt.
          </>
        ) : (
          <>Add your income to see how your month splits.</>
        )}
      </h1>

      {monthlyIncome > 0 && <p className={cn("mt-2 text-sm font-medium", pressure.text)}>{pressure.label}</p>}

      <div className="mt-6">
        <div
          className="flex h-4 overflow-hidden rounded-full bg-slate-100"
          role="img"
          aria-label={`${percent}% of your monthly income goes to debt payments`}
        >
          <div className={cn("month-bar-fill h-full", pressure.bar)} style={{ width: `${share}%` }} />
        </div>

        <dl className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div className="flex items-baseline gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 translate-y-px rounded-full", pressure.dot)} aria-hidden="true" />
            <dt className="text-sm text-slate-600">Debt payments</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">
              {formatZAR(monthlyObligations)} <span className="font-normal text-slate-500">· {percent}%</span>
            </dd>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full bg-slate-200" aria-hidden="true" />
            <dt className="text-sm text-slate-600">Everything else</dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-900">{formatZAR(leftOver)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link
          href="/money-plan"
          className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          Plan what happens to the rest
        </Link>
        {children}
      </div>
    </section>
  );
}
