import { WorkingTable } from "@/components/common/working-table";
import type { RecommendationWhy } from "@/lib/risk/explain";
import { cn } from "@/lib/utils";

// The drill-down under each recommendation: which rule fired and on what figure, the arithmetic
// behind that figure, and the SHAP drivers with the ones this advice rests on picked out.
// A native <details>, so it opens from the keyboard and works before any script has loaded.

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h4>;
}

export function WhyRecommendation({ why }: { why: RecommendationWhy }) {
  const largest = Math.max(0.01, ...why.drivers.map((driver) => driver.share));

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded text-xs font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">
          ›
        </span>
        Why this recommendation?
      </summary>

      <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-3">
        <section>
          <Heading>What triggered it</Heading>
          <ul className="mt-2 space-y-2">
            {why.triggers.map((trigger) => (
              <li key={trigger.ruleId} className="text-sm text-slate-700">
                <p>{trigger.text}</p>
                {trigger.watches && trigger.watches.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">This rule watches: {trigger.watches.join(", ")}.</p>
                )}
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{trigger.ruleId}</p>
              </li>
            ))}
          </ul>
        </section>

        {why.working.length > 0 && (
          <section>
            <Heading>The calculation</Heading>
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(15rem,100%),1fr))] gap-2">
              {why.working.map((group) => (
                <WorkingTable key={group.title} title={group.title} lines={group.lines} note={group.note} />
              ))}
            </div>
          </section>
        )}

        <section>
          <Heading>What the model relied on</Heading>
          <p className="mt-1 text-xs text-slate-500">
            {why.followsFromTier
              ? "This recommendation follows from the overall result, so every factor below played a part."
              : why.drivers.some((driver) => driver.linked)
                ? "Highlighted: the factor this recommendation rests on. The bar is its share of the model's reasoning for you."
                : "This recommendation rests on a figure the model did not rank among its top factors for you."}
          </p>
          <ul className="mt-2 space-y-2.5">
            {why.drivers.map((driver) => {
              const up = driver.direction === "increases_risk";
              const dimmed = !why.followsFromTier && !driver.linked;
              return (
                <li key={driver.feature} className={cn("text-sm", dimmed && "opacity-50")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 font-medium text-slate-900">
                      {driver.label}
                      {driver.linked && (
                        <span className="ml-2 rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
                          this one
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-slate-600">{Math.round(driver.share * 100)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={cn("h-full rounded-full", up ? "bg-rose-400" : "bg-emerald-400")}
                      style={{ width: `${Math.round((driver.share / largest) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Your value: {driver.value} · {up ? "pushes risk up" : "pushes risk down"}
                  </p>
                </li>
              );
            })}
          </ul>
          {why.otherShare >= 0.01 && (
            <p className="mt-2 text-xs text-slate-500">
              The remaining {Math.round(why.otherShare * 100)}% of the model&apos;s reasoning is spread across smaller factors.
            </p>
          )}
        </section>

        <p className="border-t border-slate-200 pt-2 text-[11px] text-slate-400">
          Rule set v{why.rulesVersion} · SHAP values show what the model relied on, not what caused your situation.
          {why.staleRules && " This recommendation came from an older rule set; the rule is described as it stands today."}
        </p>
      </div>
    </details>
  );
}
