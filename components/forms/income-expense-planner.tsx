"use client";

import { useMemo, useState } from "react";
import { AiRecommendationsCard } from "@/components/cards/ai-recommendations-card";
import { MetricCard } from "@/components/cards/metric-card";
import { IncomeExpenseChart } from "@/components/charts/income-expense-chart";
import { Card } from "@/components/common/card";
import { calculateCashflowSnapshot, getCashflowGuidance } from "@/lib/dashboard/cashflow";
import {
  buildBankAccountBreakdown,
  buildDebtExpenseSegments,
  buildLivingExpenseSegments
} from "@/lib/dashboard/expense-breakdown";
import type { AppDebt, RiskStatus } from "@/lib/domain";
import { formatZAR } from "@/lib/format";

type Props = {
  userId: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  defaultLivingExpenses: number;
  debts: Pick<AppDebt, "status" | "monthlyObligation" | "debtType" | "creditorName" | "balance">[];
  riskStatus: RiskStatus;
  creditScore: number;
};

export function IncomeExpensePlanner({
  userId,
  bankAccountNumber,
  monthlyIncome,
  defaultLivingExpenses,
  debts,
  riskStatus,
  creditScore
}: Props) {
  const baseIncome = Number.isFinite(monthlyIncome) ? monthlyIncome : 0;
  const [livingExpenses, setLivingExpenses] = useState(
    Number.isFinite(defaultLivingExpenses) ? defaultLivingExpenses : 0
  );

  const snapshot = useMemo(
    () =>
      calculateCashflowSnapshot({
        monthlyIncome: baseIncome,
        nonDebtExpenses: livingExpenses,
        debts
      }),
    [baseIncome, debts, livingExpenses]
  );

  const guidance = useMemo(() => getCashflowGuidance(snapshot, riskStatus), [snapshot, riskStatus]);
  const livingSegments = useMemo(
    () => buildLivingExpenseSegments(snapshot.estimatedLivingExpenses, riskStatus),
    [snapshot.estimatedLivingExpenses, riskStatus]
  );
  const debtSegments = useMemo(() => buildDebtExpenseSegments(debts), [debts]);
  const bankAccounts = useMemo(
    () =>
      buildBankAccountBreakdown({
        userSeed: userId,
        bankAccountNumber,
        monthlyIncome: snapshot.monthlyIncome,
        livingExpenses: snapshot.estimatedLivingExpenses,
        debtExpenses: snapshot.monthlyDebtObligations
      }),
    [
      bankAccountNumber,
      snapshot.estimatedLivingExpenses,
      snapshot.monthlyDebtObligations,
      snapshot.monthlyIncome,
      userId
    ]
  );

  const scoreTrend =
    snapshot.projectedScoreDelta30d > 0
      ? `+${snapshot.projectedScoreDelta30d}`
      : String(snapshot.projectedScoreDelta30d);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Monthly Income" value={formatZAR(snapshot.monthlyIncome)} />
        <MetricCard title="Monthly Debt Expense" value={formatZAR(snapshot.monthlyDebtObligations)} />
        <MetricCard
          title="Total Monthly Expenses"
          value={formatZAR(snapshot.totalMonthlyExpenses)}
          subtitle={`${(snapshot.expenseToIncomeRatio * 100).toFixed(1)}% of income`}
        />
        <MetricCard
          title="Net Cashflow"
          value={formatZAR(snapshot.netCashflow)}
          subtitle={`30-day score trend: ${scoreTrend} points`}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Income vs Expenses</h3>
            <p className="text-sm text-slate-500">
              Adjust non-debt expenses to test how cashflow changes your credit pressure.
            </p>
          </div>
          <label className="w-full max-w-xs text-sm md:w-auto">
            <span className="mb-1 block font-medium text-slate-700">Current non-debt monthly expenses</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={livingExpenses}
              onChange={(event) => setLivingExpenses(Number(event.target.value) || 0)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="mt-4">
          <IncomeExpenseChart
            income={snapshot.monthlyIncome}
            livingExpenses={snapshot.estimatedLivingExpenses}
            debtObligations={snapshot.monthlyDebtObligations}
            netCashflow={snapshot.netCashflow}
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="bg-gradient-to-b from-white to-cyan-50/40">
          <h3 className="text-lg font-semibold text-slate-900">Non-debt Expense Segments</h3>
          <p className="mt-1 text-sm text-slate-600">
            These segments split your living expenses so you can quickly identify where most money is spent.
          </p>
          <div className="mt-4 space-y-3">
            {livingSegments.map((segment) => (
              <div key={segment.label} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-slate-700">{segment.label}</span>
                  <span className="font-semibold text-slate-900">{formatZAR(segment.amount)}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-cyan-500"
                    style={{ width: `${Math.max(6, Math.min(100, segment.share))}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{segment.share.toFixed(1)}% of non-debt spend</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-gradient-to-b from-white to-indigo-50/40">
          <h3 className="text-lg font-semibold text-slate-900">Debt Expense by Credit Type</h3>
          <p className="mt-1 text-sm text-slate-600">
            This view categorizes monthly debt obligations by credit type to show where repayment pressure sits.
          </p>
          {debtSegments.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No active debt obligations to categorize yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {debtSegments.map((segment) => (
                <div key={segment.label} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-700">{segment.label}</span>
                    <span className="font-semibold text-slate-900">{formatZAR(segment.amount)}</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-indigo-500"
                      style={{ width: `${Math.max(6, Math.min(100, segment.share))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{segment.share.toFixed(1)}% of debt obligations</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900">Cashflow Impact on Credit Score</h3>
          <p className="mt-1 text-sm text-slate-600">
            Current score: {creditScore}. Debt-to-income is {(snapshot.debtToIncomeRatio * 100).toFixed(1)}%. Score
            pressure is <span className="font-semibold">{snapshot.scorePressure}</span>.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {guidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <AiRecommendationsCard
          title="Income-driven Recommendations"
          compact
          requestBody={{
            focus: "income_expense",
            cashflow: {
              monthlyIncome: snapshot.monthlyIncome,
              nonDebtExpenses: snapshot.estimatedLivingExpenses,
              debtObligations: snapshot.monthlyDebtObligations,
              netCashflow: snapshot.netCashflow,
              debtToIncomeRatio: snapshot.debtToIncomeRatio,
              expenseToIncomeRatio: snapshot.expenseToIncomeRatio,
              projectedScoreDelta30d: snapshot.projectedScoreDelta30d,
              scorePressure: snapshot.scorePressure
            }
          }}
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Income and Expenses Per Bank Account</h3>
            <p className="mt-1 text-sm text-slate-600">
              Educational cash-allocation view showing where income lands and which account carries most expenses.
            </p>
          </div>
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            {bankAccounts.length} account{bankAccounts.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-3">Bank Account</th>
                <th className="px-4 py-3">Income</th>
                <th className="px-4 py-3">Living Expenses</th>
                <th className="px-4 py-3">Debt Expenses</th>
                <th className="px-4 py-3">Total Expenses</th>
                <th className="px-4 py-3">Net Position</th>
              </tr>
            </thead>
            <tbody>
              {bankAccounts.map((account) => (
                <tr key={`${account.bankName}-${account.accountNumberMasked}`} className="border-t border-slate-200 bg-white">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{account.accountLabel}</p>
                    <p className="text-xs text-slate-500">
                      {account.bankName} {account.accountNumberMasked}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-medium text-emerald-700">{formatZAR(account.incomeAmount)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatZAR(account.livingExpenseAmount)}</td>
                  <td className="px-4 py-3 text-slate-700">{formatZAR(account.debtExpenseAmount)}</td>
                  <td className="px-4 py-3 text-slate-900">{formatZAR(account.totalExpenseAmount)}</td>
                  <td className={`px-4 py-3 font-semibold ${account.netAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {formatZAR(account.netAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
