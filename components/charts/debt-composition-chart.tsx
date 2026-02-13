"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatZAR } from "@/lib/format";

type Item = {
  creditorName: string;
  amount: number;
};

const colors = ["#2563eb", "#0ea5e9", "#22c55e", "#f59e0b", "#f97316", "#9333ea", "#ef4444"];

export function DebtCompositionChart({ data }: { data: Item[] }) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-500">No active debts to visualize yet.</p>;
  }

  const sortedData = [...data].sort((a, b) => b.amount - a.amount);
  const totalAmount = sortedData.reduce((sum, item) => sum + item.amount, 0);
  const chartData = sortedData.map((item, index) => ({
    ...item,
    color: colors[index % colors.length],
    share: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0
  }));

  return (
    <div className="space-y-4">
      <div className="relative h-72 w-full rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} dataKey="amount" nameKey="creditorName" innerRadius={72} outerRadius={112} paddingAngle={2}>
              {chartData.map((entry) => (
                <Cell key={entry.creditorName} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ borderRadius: 12, borderColor: "#dbeafe", boxShadow: "0 8px 30px rgba(15, 23, 42, 0.1)" }}
              formatter={(value, _name, item) => {
                const payload = item?.payload as (Item & { share?: number }) | undefined;
                return [formatZAR(Number(value)), `${payload?.creditorName ?? "Creditor"} (${(payload?.share ?? 0).toFixed(1)}%)`];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-full border border-white/80 bg-white/90 px-4 py-2 text-center shadow">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total active debt</p>
            <p className="text-sm font-bold text-slate-900">{formatZAR(totalAmount)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {chartData.slice(0, 6).map((entry) => (
          <div
            key={entry.creditorName}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="font-medium text-slate-700">{entry.creditorName}</span>
            </div>
            <span className="font-semibold text-slate-900">{entry.share.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
