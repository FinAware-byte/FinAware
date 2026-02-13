import type { RiskStatus } from "@/lib/domain";
import { cn } from "@/lib/utils";

export function RiskBadge({ risk }: { risk: RiskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        risk === "HIGH" && "bg-red-100 text-red-700",
        risk === "MEDIUM" && "bg-amber-100 text-amber-700",
        risk === "LOW" && "bg-emerald-100 text-emerald-700"
      )}
    >
      {risk}
    </span>
  );
}
