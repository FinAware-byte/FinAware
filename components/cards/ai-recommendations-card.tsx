"use client";

import { useEffect, useState } from "react";
import type { AiRecommendationsResponse, RecommendationAction } from "@/types/ai";
import { Card } from "@/components/common/card";
import { WorkingTable } from "@/components/common/working-table";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  compact?: boolean;
  requestBody?: Record<string, unknown>;
};

// Money is the reason anyone reads this card, so the money is what it leads with: one figure set
// large enough to stop on, then each action with its own number on the right. The prose sits
// underneath as support rather than carrying the point.

const tone: Record<RecommendationAction["tone"], { rule: string; amount: string; chip: string; label: string }> = {
  urgent: { rule: "bg-rose-500", amount: "text-rose-700", chip: "bg-rose-50 text-rose-700", label: "Urgent" },
  opportunity: {
    rule: "bg-emerald-500",
    amount: "text-emerald-700",
    chip: "bg-emerald-50 text-emerald-700",
    label: "Worth doing"
  },
  steady: { rule: "bg-slate-400", amount: "text-slate-900", chip: "bg-slate-100 text-slate-600", label: "On track" }
};

export function AiRecommendationsCard({
  title = "How to improve your score",
  compact = false,
  requestBody
}: Props) {
  const [data, setData] = useState<AiRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestBodyJson = JSON.stringify(requestBody ?? {});

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/ai-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBodyJson
        });
        if (!response.ok) {
          throw new Error("Unable to load recommendations.");
        }

        const payload = (await response.json()) as AiRecommendationsResponse;
        setData(payload);
      } catch {
        setError("Unable to load recommendations right now.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [requestBodyJson]);

  const actions = data?.actions ?? [];

  return (
    <Card className={compact ? "max-h-[640px] overflow-auto" : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {data?.source && (
          // Which path wrote the sentences. The amounts are calculated either way.
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            {data.source === "model" ? "Worded by AI from your figures" : "Worked out from your accounts"}
          </span>
        )}
      </div>

      {loading && <p className="mt-3 text-sm text-slate-500">Working out your numbers…</p>}
      {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

      {data && (
        <div className="mt-4 space-y-5">
          {data.headline ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-3xl font-bold tracking-tight tabular-nums text-slate-900 sm:text-4xl">
                {data.headline.amount}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{data.headline.label}</p>
              <p className="mt-1 max-w-prose text-sm text-slate-600">{data.headline.sentence}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-700">{data.summary}</p>
          )}

          {actions.length > 0 ? (
            <ol className="space-y-3">
              {actions.map((action, index) => {
                const style = tone[action.tone] ?? tone.steady;
                return (
                  <li
                    key={action.headline}
                    className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 pl-5 transition-shadow hover:shadow-card"
                  >
                    <span className={cn("absolute inset-y-0 left-0 w-1.5", style.rule)} aria-hidden="true" />

                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-semibold", style.chip)}>
                      {index + 1}. {style.label}
                    </span>

                    {/* Phone: the figure sits above the words, where it is read first and the
                        headline gets the full width. Wider: figure right, text left. */}
                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                      <div className="min-w-0 sm:flex-1">
                        <p className="text-base font-semibold leading-snug text-slate-900">{action.headline}</p>
                        <p className="mt-1 max-w-prose text-sm text-slate-600">{action.detail}</p>
                      </div>

                      {action.amount && (
                        <div className="shrink-0 text-left sm:text-right">
                          <p className={cn("text-2xl font-bold tracking-tight tabular-nums", style.amount)}>
                            {action.amount}
                          </p>
                          {action.amountLabel && (
                            <p className="text-xs leading-tight text-slate-500 sm:max-w-[10rem]">{action.amountLabel}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {action.working && action.working.length > 0 ? (
                      <details className="group mt-3 border-t border-slate-100 pt-2">
                        <summary className="flex cursor-pointer list-none items-baseline gap-1 text-xs text-slate-400 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
                          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
                            ›
                          </span>
                          <span>
                            <span className="font-semibold text-brand-700">Why this?</span> Worked out from {action.basis}
                          </span>
                        </summary>
                        <div className="mt-2">
                          <WorkingTable lines={action.working} />
                        </div>
                      </details>
                    ) : (
                      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">Worked out from {action.basis}</p>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {data.top_actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}

          <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">{data.warnings.join(" · ")}</p>
        </div>
      )}
    </Card>
  );
}
