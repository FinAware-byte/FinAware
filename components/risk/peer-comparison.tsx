"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/common/card";
import { formatPeerValue, isFavourable, positionSentence } from "@/lib/peers/format";
import type { PeerMetric, PeerSegmentResponse } from "@/lib/peers/types";
import { cn } from "@/lib/utils";

// "People in a similar position to you": the peer group, each figure against the group's middle
// half, and — where the group is split — what the members who manage comfortably look like.
// The bar is the group's spread by percentile: the band is its middle half, the tick its median,
// the dot this user.

function PositionBar({ metric }: { metric: PeerMetric }) {
  const favourable = isFavourable(metric);
  return (
    <div className="relative mt-2 h-2 rounded-full bg-slate-100" aria-hidden="true">
      <div className="absolute inset-y-0 rounded-full bg-slate-300/80" style={{ left: "25%", width: "50%" }} />
      <div className="absolute inset-y-[-2px] w-0.5 bg-slate-500" style={{ left: "50%" }} />
      <div
        className={cn(
          "absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white",
          favourable ? "bg-emerald-500" : "bg-amber-500"
        )}
        style={{ left: `${Math.min(100, Math.max(0, metric.percentile))}%` }}
      />
    </div>
  );
}

export function PeerComparison() {
  const [data, setData] = useState<PeerSegmentResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/peer-segment", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((payload: PeerSegmentResponse) => active && setData(payload))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">People in a similar position</h3>
        <p className="mt-2 text-sm text-slate-500">Peer groups are not available right now.</p>
      </Card>
    );
  }
  if (!data) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">People in a similar position</h3>
        <p className="mt-2 text-sm text-slate-500">Finding your peer group…</p>
      </Card>
    );
  }
  if (!data.available) {
    return (
      <Card>
        <h3 className="text-lg font-semibold text-slate-900">People in a similar position</h3>
        <p className="mt-2 text-sm text-slate-500">Complete your financial profile to see how you compare.</p>
      </Card>
    );
  }

  const { segment, metrics, model } = data;
  const comfortable = segment.comfortableShare;
  // Only worth saying when the group is split; if nearly everyone is comfortable, their figures
  // are just the group's figures again.
  const showComfortable = comfortable < 0.9 && metrics.some((metric) => metric.comfortableMedian !== null);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">People in a similar position</h3>
          <p className="mt-1 max-w-prose text-sm text-slate-600">
            Your figures place you among <span className="font-semibold text-slate-900">{segment.size.toLocaleString("en-ZA")}</span>{" "}
            profiles ({Math.round(segment.share * 100)}% of the dataset) in the group{" "}
            <span className="font-semibold text-slate-900">&ldquo;{segment.name}&rdquo;</span>.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
          Group {segment.id + 1} of {model.k}
        </span>
      </div>

      {!data.typical && (
        <p role="note" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Your figures are unusual even for this group — further from its middle than 95% of its members — so treat the
          comparison as rough.
        </p>
      )}

      <ul className="mt-4 space-y-4">
        {metrics.map((metric) => (
          <li key={metric.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{metric.label}</p>
              <p className="text-sm tabular-nums text-slate-700">
                You <span className="font-semibold text-slate-900">{formatPeerValue(metric.key, metric.you)}</span>
                <span className="text-slate-400"> · </span>
                group {formatPeerValue(metric.key, metric.groupMedian)}
              </p>
            </div>
            {metric.outsideGroup ? (
              <p className="mt-1 text-xs text-amber-800">
                {positionSentence(metric)}.{" "}
                {metric.key === "savings_months"
                  ? `The dataset's savers hold far more than most households — half of this group has over ${formatPeerValue(metric.key, metric.groupMedian)} — so your savings cannot be placed within it.`
                  : "Your figure is beyond the whole group, so there is no position to show."}
              </p>
            ) : (
              <>
                <PositionBar metric={metric} />
                <p className="mt-1 text-xs text-slate-500">
                  {positionSentence(metric)}.{" "}
                  {/* A range that starts and ends on the same figure ("0% to 0%") says nothing; say
                      what it means instead. */}
                  {metric.groupP25 === metric.groupP75
                    ? metric.key === "repayment_ratio" && metric.groupP75 === 0
                      ? `${Math.round((1 - segment.withLoanShare) * 100)}% of this group have no loan repayments at all.`
                      : `Most of the group sit at ${formatPeerValue(metric.key, metric.groupMedian)}.`
                    : `The middle half of the group is ${formatPeerValue(metric.key, metric.groupP25)} to ${formatPeerValue(metric.key, metric.groupP75)}.`}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>

      {showComfortable && (
        <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="text-sm font-semibold text-emerald-900">
            {Math.round(comfortable * 100)}% of this group have at least a tenth of their income left each month
          </p>
          <p className="mt-1 text-sm text-emerald-900">
            Their typical figures:{" "}
            {metrics
              .filter((metric) => metric.comfortableMedian !== null && ["expense_ratio", "repayment_ratio", "surplus_ratio"].includes(metric.key))
              .map((metric) => `${metric.label.toLowerCase()} ${formatPeerValue(metric.key, metric.comfortableMedian as number)} (you ${formatPeerValue(metric.key, metric.you)})`)
              .join("; ")}
            .
          </p>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        {model.name} on {model.recordsUsed.toLocaleString("en-ZA")} synthetic profiles in {model.k} groups. The groups
        overlap (silhouette {model.silhouette.toFixed(2)}), so they are useful bands rather than distinct types.{" "}
        {model.recordsExcluded.toLocaleString("en-ZA")} records whose loan repayments exceed their whole income were left
        out. A comparison, not advice.{" "}
        <Link href="/about-the-model" className="font-semibold text-brand-700 hover:underline">
          About the models
        </Link>
      </p>
    </Card>
  );
}
