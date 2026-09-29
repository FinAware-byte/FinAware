import Link from "next/link";
import { cn } from "@/lib/utils";

// The supporting numbers. Deliberately quiet: one bar of the month carries the page, and four
// competing tiles underneath it would take that back. These are a reference strip, not headlines —
// separated by rules rather than boxed into identical cards.

export type Figure = {
  label: string;
  value: string;
  note?: string;
  href?: string;
  /** Renders in the accent colour when the number needs attention. */
  emphasis?: "normal" | "attention";
};

export function FigureRow({ figures }: { figures: Figure[] }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
      <dl className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
        {figures.map((figure, index) => {
          const body = (
            <>
              <dt className="text-sm text-slate-600">{figure.label}</dt>
              <dd
                className={cn(
                  "mt-1 text-xl font-semibold tabular-nums tracking-tight",
                  figure.emphasis === "attention" ? "text-rose-700" : "text-slate-900"
                )}
              >
                {figure.value}
              </dd>
              {figure.note && <p className="mt-1 text-xs leading-relaxed text-slate-500">{figure.note}</p>}
            </>
          );

          return (
            <div
              key={figure.label}
              className={cn(
                "p-5",
                // Vertical rules between columns on wide screens only; on narrow screens the grid
                // stacks and the horizontal dividers above do the separating.
                index > 0 && "lg:border-l lg:border-slate-200",
                index === 2 && "sm:border-t sm:border-slate-200 lg:border-t-0",
                index === 3 && "sm:border-t sm:border-slate-200 lg:border-t-0",
                index === 1 && "sm:border-l sm:border-slate-200"
              )}
            >
              {figure.href ? (
                <Link
                  href={figure.href}
                  className="block rounded-lg transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {body}
                </Link>
              ) : (
                body
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
