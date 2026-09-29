import Link from "next/link";
import { Card } from "@/components/common/card";
import type { FigureSource, ModelCard } from "@/lib/models/model-card";
import { cn } from "@/lib/utils";

// One card per model. The limits sit directly under the description, before any figure, so
// nobody reads "99.7%" without first reading what it is not.

const sourceBadge: Record<FigureSource, { label: string; className: string; title: string }> = {
  live: {
    label: "Live",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    title: "reported by the running model right now"
  },
  report: {
    label: "Report",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
    title: "from the evaluation write-up in the ML methodology"
  },
  code: {
    label: "Code",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
    title: "read from the application's own constants"
  }
};

const kindTone: Record<ModelCard["kind"], string> = {
  "Machine learning": "bg-brand-50 text-brand-700 ring-brand-200",
  Calculation: "bg-slate-100 text-slate-700 ring-slate-200",
  "Fixed rules": "bg-slate-100 text-slate-700 ring-slate-200",
  "Language model": "bg-violet-50 text-violet-700 ring-violet-200"
};

function trained(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
}

export function ModelCardList({ cards }: { cards: ModelCard[] }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Where each figure comes from:</span>
        {(Object.keys(sourceBadge) as FigureSource[]).map((source) => (
          <span key={source} className="inline-flex items-center gap-1.5">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold ring-1", sourceBadge[source].className)}>
              {sourceBadge[source].label}
            </span>
            {sourceBadge[source].title}
          </span>
        ))}
      </div>

      {cards.map((card) => (
        <Card key={card.key}>
          <article aria-labelledby={`model-${card.key}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id={`model-${card.key}`} className="text-lg font-semibold text-slate-900">
                    {card.name}
                  </h2>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold ring-1", kindTone[card.kind])}>
                    {card.kind}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {[card.version, card.trainedAt ? `trained ${trained(card.trainedAt)}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              {card.status && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-semibold",
                    card.status.tone === "warn" ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                  )}
                >
                  {card.status.label}
                </span>
              )}
            </div>

            <p className="mt-3 max-w-prose text-sm text-slate-700">{card.does}</p>

            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">What it does not do</p>
              <ul className="mt-1.5 space-y-1.5">
                {card.doesNot.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-700">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {card.figures.length > 0 && (
              <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-3">
                {card.figures.map((figure) => (
                  <div key={figure.label} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    {/* Badge above the figure, not beside it: a citation beside "F1 0.52–0.55"
                        squeezed the figure onto three lines at phone width. */}
                    <span
                      title={sourceBadge[figure.source].title}
                      className={cn("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", sourceBadge[figure.source].className)}
                    >
                      {figure.reference ?? sourceBadge[figure.source].label}
                    </span>
                    <p className="mt-1.5 text-xl font-bold tabular-nums tracking-tight text-slate-900">{figure.value}</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-800">{figure.label}</p>
                    {figure.detail && <p className="mt-1 text-xs text-slate-500">{figure.detail}</p>}
                  </div>
                ))}
              </div>
            )}

            {card.unavailable && (
              <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {card.unavailable}
              </p>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Used on{" "}
              {card.whereUsed.map((place, index) => (
                <span key={place.href}>
                  {index > 0 && (index === card.whereUsed.length - 1 ? " and " : ", ")}
                  <Link href={place.href} className="font-semibold text-brand-700 hover:underline">
                    {place.label}
                  </Link>
                </span>
              ))}
              .
            </p>
          </article>
        </Card>
      ))}
    </div>
  );
}
