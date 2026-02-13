"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { ScoreProjectionPoint } from "@/lib/dashboard/score-projection";

function ProjectionTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey?: string; value?: number }>;
}) {
  if (!active || !payload || payload.length === 0) return null;

  const current = payload.find((item) => item.dataKey === "currentPath")?.value ?? 0;
  const recommended = payload.find((item) => item.dataKey === "recommendedPath")?.value ?? 0;
  const gap = recommended - current;

  return (
    <div className="rounded-xl border border-blue-100 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold text-slate-900">{label}</p>
      <p className="mt-1 text-orange-700">Current path: {Math.round(current)}</p>
      <p className="text-blue-700">Recommended path: {Math.round(recommended)}</p>
      <p className="mt-1 font-semibold text-emerald-700">Gap: +{Math.round(gap)} points</p>
    </div>
  );
}

export function CreditScoreProjectionChart({ data }: { data: ScoreProjectionPoint[] }) {
  return (
    <div className="h-80 w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dbe4f0" />
          <XAxis dataKey="label" />
          <YAxis domain={[300, 850]} tickCount={7} tickFormatter={(value) => `${value}`} />
          <ReferenceArea y1={300} y2={619} fill="#fee2e2" fillOpacity={0.35} />
          <ReferenceArea y1={620} y2={739} fill="#fef3c7" fillOpacity={0.35} />
          <ReferenceArea y1={740} y2={850} fill="#dcfce7" fillOpacity={0.35} />
          <Tooltip
            content={<ProjectionTooltip />}
            cursor={{ stroke: "#94a3b8", strokeDasharray: "4 4" }}
          />
          <Legend
            wrapperStyle={{ paddingTop: 8 }}
            formatter={(value) =>
              value === "recommendedPath" ? "Recommended actions" : "Current payment behavior"
            }
          />
          <ReferenceLine y={620} stroke="#f59e0b" strokeDasharray="4 4" label="Fair boundary" />
          <ReferenceLine y={740} stroke="#16a34a" strokeDasharray="4 4" label="Good boundary" />
          <Line
            type="monotone"
            dataKey="currentPath"
            stroke="#f97316"
            strokeWidth={3}
            dot={{ r: 3, fill: "#f97316" }}
            activeDot={{ r: 5, fill: "#ea580c" }}
          />
          <Line
            type="monotone"
            dataKey="recommendedPath"
            stroke="#2563eb"
            strokeWidth={3}
            dot={{ r: 3, fill: "#2563eb" }}
            activeDot={{ r: 5, fill: "#1d4ed8" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
