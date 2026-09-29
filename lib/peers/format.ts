import { formatZAR } from "@/lib/format";
import type { PeerMetric } from "@/lib/peers/types";

export function formatPeerValue(key: PeerMetric["key"], value: number): string {
  switch (key) {
    case "income":
      return formatZAR(value);
    case "expense_ratio":
    case "repayment_ratio":
    case "surplus_ratio":
      return `${Math.round(value * 100)}%`;
    case "savings_months":
      return value >= 100 ? `${Math.round(value)} months` : `${value.toFixed(1)} months`;
    default:
      return String(Math.round(value));
  }
}

/** Whether this user's figure sits on the better side of the group's median. */
export function isFavourable(metric: PeerMetric): boolean {
  return metric.higherIsBetter ? metric.you >= metric.groupMedian : metric.you <= metric.groupMedian;
}

/**
 * Where the user sits, in words. A percentile is only quoted when the user is inside the group's
 * range — "below 0% of the group" says nothing, and says it misleadingly.
 */
export function positionSentence(metric: PeerMetric): string {
  if (metric.outsideGroup) {
    return metric.you < metric.groupMedian ? "Lower than anyone in the group" : "Higher than anyone in the group";
  }
  const below = Math.round(metric.percentile);
  if (below >= 50) return `Higher than ${below}% of the group`;
  return `Lower than ${100 - below}% of the group`;
}
