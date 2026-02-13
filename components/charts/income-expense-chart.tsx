"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatZAR } from "@/lib/format";

type Props = {
  income: number;
  livingExpenses: number;
  debtObligations: number;
  netCashflow: number;
};

export function IncomeExpenseChart({ income, livingExpenses, debtObligations, netCashflow }: Props) {
  const data = [
    {
      name: "Cashflow",
      Income: income,
      "Non-debt expenses": livingExpenses,
      "Debt obligations": debtObligations,
      Surplus: Math.max(0, netCashflow),
      Deficit: Math.abs(Math.min(0, netCashflow))
    }
  ];

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="name" />
          <YAxis tickFormatter={(value) => `R${Math.round(Number(value) / 1000)}k`} />
          <Tooltip formatter={(value) => formatZAR(Number(value))} />
          <Legend />
          <Bar dataKey="Income" fill="#2563eb" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Non-debt expenses" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Debt obligations" fill="#f59e0b" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Surplus" fill="#16a34a" radius={[6, 6, 0, 0]} />
          <Bar dataKey="Deficit" fill="#dc2626" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
