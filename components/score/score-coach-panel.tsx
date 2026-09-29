import { Card } from "@/components/common/card";
import type { ScoreCoaching } from "@/lib/finance/score-coach";
import { cn } from "@/lib/utils";

// The coach leads with the one action worth taking, then shows the rest with the points each is
// giving up — so the ordering is visibly justified rather than asserted.

const bandTone: Record<ScoreCoaching["band"], string> = {
  Excellent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Good: "bg-sky-50 text-sky-700 ring-sky-200",
  Fair: "bg-amber-50 text-amber-700 ring-amber-200",
  Poor: "bg-rose-50 text-rose-700 ring-rose-200"
};

export function ScoreCoachPanel({ coaching }: { coaching: ScoreCoaching }) {
  const { topStep } = coaching;
  const maxHeadroom = Math.max(1, ...coaching.steps.map((step) => step.headroom));

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-500">Your score today</p>
            <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900">{coaching.score}</p>
            <span
              className={cn(
                "mt-2 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
                bandTone[coaching.band]
              )}
            >
              {coaching.band}
            </span>
          </div>

          {coaching.toNextBand && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-right">
              <p className="text-2xl font-bold tabular-nums text-slate-900">+{coaching.toNextBand.points}</p>
              <p className="text-xs text-slate-600">
                points to <span className="font-semibold">{coaching.toNextBand.band}</span>
              </p>
            </div>
          )}
        </div>
      </Card>

      {topStep && (
        <Card className="border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">Do this first</span>
            <span className="text-xs font-medium text-slate-600">
              worth up to {topStep.headroom} point{topStep.headroom === 1 ? "" : "s"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">{topStep.title}</h3>
          <p className="mt-1 max-w-prose text-sm text-slate-700">{topStep.action}</p>
          <p className="mt-3 border-t border-brand-200/60 pt-2 text-xs text-slate-500">
            Right now: {topStep.current}
          </p>
        </Card>
      )}

      <Card>
        <h3 className="text-lg font-semibold text-slate-900">What each factor is costing you</h3>
        <p className="mt-1 text-sm text-slate-600">
          Your score is worked out from five factors. The bar shows the points each one is currently giving up, out of
          the {coaching.totalHeadroom} still available to you.
        </p>

        <ul className="mt-4 space-y-4">
          {coaching.steps.map((step) => (
            <li key={step.factorKey} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-900">{step.title}</p>
                <p className="text-sm font-semibold tabular-nums text-slate-700">
                  {step.headroom === 0 ? (
                    <span className="text-emerald-700">nothing lost here</span>
                  ) : (
                    <>−{step.headroom} points</>
                  )}
                </p>
              </div>

              {/* Width is the share of the largest gap, so the longest bar is the biggest problem. */}
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full", step.headroom === 0 ? "bg-emerald-400" : "bg-rose-400")}
                  style={{ width: `${step.headroom === 0 ? 100 : Math.round((step.headroom / maxHeadroom) * 100)}%` }}
                />
              </div>

              <p className="mt-2 text-sm text-slate-600">{step.action}</p>
              <p className="mt-1 text-xs text-slate-400">
                {step.current} · {step.why}
                {step.waitingOnTime && " · improves with time"}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
