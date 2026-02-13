import { cn } from "@/lib/utils";

const toneStyles = {
  neutral: "border-slate-200 bg-white",
  blue: "border-blue-200 bg-gradient-to-br from-blue-50 to-white",
  cyan: "border-cyan-200 bg-gradient-to-br from-cyan-50 to-white",
  emerald: "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white",
  amber: "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
} as const;

export function MetricCard({
  title,
  value,
  subtitle,
  right,
  tone = "neutral"
}: {
  title: string;
  value: string;
  subtitle?: string;
  right?: React.ReactNode;
  tone?: keyof typeof toneStyles;
}) {
  return (
    <div className={cn("rounded-xl border p-5 shadow-card", toneStyles[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {right}
      </div>
    </div>
  );
}
