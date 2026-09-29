import type { WorkingLine } from "@/types/working";
import { cn } from "@/lib/utils";

// A calculation laid out like a till slip: inputs down the left, figures right-aligned, and the
// answer under a rule — so the step from the figures to the result can be followed by eye.

export function WorkingTable({ title, lines, note }: { title?: string; lines: WorkingLine[]; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      {title && <p className="text-xs font-semibold text-slate-700">{title}</p>}
      <dl className={cn("space-y-1 text-sm", title && "mt-2")}>
        {lines.map((line, index) => (
          <div
            key={`${line.label}-${index}`}
            className={cn(
              "flex items-baseline justify-between gap-4",
              line.result && "font-semibold text-slate-900",
              // Rule once, above the first answer line, not between consecutive answers.
              line.result && !lines[index - 1]?.result && index > 0 && "mt-1 border-t border-slate-300 pt-1"
            )}
          >
            <dt className={cn("min-w-0", !line.result && "text-slate-600")}>{line.label}</dt>
            <dd className="shrink-0 tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-xs text-slate-500">{note}</p>}
    </div>
  );
}
