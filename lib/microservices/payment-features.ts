import { prisma } from "@/lib/db/prisma";

// Behavioural features for the missed-payment model, computed from Payment_History.
// These MUST match ml-service/ml/payment/dataset.py: the model was fitted on those definitions,
// so any drift here silently degrades the prediction rather than failing loudly.
// Existing tables are READ ONLY, as everywhere else in the Financial Data Service.

export const MIN_PRIOR_PAYMENTS = 3;
export const NEVER_MISSED_MONTHS = 99;
const MS_PER_MONTH = 1000 * 60 * 60 * 24 * 30.44;

export type PaymentRow = { debtId: number; dueDate: Date; missed: boolean };

export type DebtRow = {
  debtId: number;
  creditorName: string;
  status: string;
  interestRate: number;
  balance: number;
};

export type DebtPaymentFeatures = {
  debt_id: number;
  creditor_name: string;
  prior_payment_count: number;
  prior_miss_rate: number;
  recent6_miss_rate: number;
  current_miss_streak: number;
  months_since_last_miss: number;
  active_debt_count: number;
  debt_interest_rate_pct: number;
  debt_balance_to_income: number;
  total_balance_to_income: number;
  debt_status: string;
};

export type PaymentFeatureResult =
  | { ok: true; debts: DebtPaymentFeatures[]; paymentsOnRecord: number }
  | { ok: false; reason: "NO_DEBTS" | "NOT_ENOUGH_HISTORY" | "NO_INCOME"; paymentsOnRecord: number };

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Behaviour is measured across the user's whole payment history, ordered by due date — the same
 * way the training panel accumulates it. The per-debt fields then come from each active debt.
 */
export function buildPaymentFeatures(args: {
  payments: PaymentRow[];
  debts: DebtRow[];
  monthlyIncome: number;
  now?: Date;
}): PaymentFeatureResult {
  const payments = [...args.payments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // Why a literal comparison and not toDebtStatus(): that helper maps anything it does not
  // recognise to ACTIVE, which would quietly inflate this count. Training counted debts whose
  // status is exactly "Active" (ml/payment/dataset.py), so this must do the same.
  const activeDebtCount = args.debts.filter((debt) => debt.status.trim().toLowerCase() === "active").length;

  if (payments.length < MIN_PRIOR_PAYMENTS) {
    return { ok: false, reason: "NOT_ENOUGH_HISTORY", paymentsOnRecord: payments.length };
  }
  if (args.monthlyIncome <= 0) {
    return { ok: false, reason: "NO_INCOME", paymentsOnRecord: payments.length };
  }
  // Every outstanding debt is scored, not just the ones marked Active: a Garnished or
  // Re-considered debt still has payments falling due, and those are the highest-risk ones.
  // Debt status is a feature of the model, never a filter on who gets scored.
  const scoreable = args.debts;
  if (scoreable.length === 0) {
    return { ok: false, reason: "NO_DEBTS", paymentsOnRecord: payments.length };
  }

  const misses = payments.filter((payment) => payment.missed).length;
  const recent = payments.slice(-6);
  const recentMisses = recent.filter((payment) => payment.missed).length;

  let streak = 0;
  for (let i = payments.length - 1; i >= 0 && payments[i].missed; i -= 1) streak += 1;

  const lastMiss = [...payments].reverse().find((payment) => payment.missed);
  const now = args.now ?? new Date();
  const monthsSinceLastMiss = lastMiss
    ? round(Math.max(0, (now.getTime() - lastMiss.dueDate.getTime()) / MS_PER_MONTH), 2)
    : NEVER_MISSED_MONTHS;

  const totalBalance = args.debts.reduce((sum, debt) => sum + debt.balance, 0);

  const shared = {
    prior_payment_count: payments.length,
    prior_miss_rate: round(misses / payments.length, 4),
    recent6_miss_rate: round(recentMisses / recent.length, 4),
    current_miss_streak: streak,
    months_since_last_miss: monthsSinceLastMiss,
    active_debt_count: activeDebtCount,
    total_balance_to_income: round(totalBalance / args.monthlyIncome, 4)
  };

  return {
    ok: true,
    paymentsOnRecord: payments.length,
    debts: scoreable.map((debt) => ({
      ...shared,
      debt_id: debt.debtId,
      creditor_name: debt.creditorName,
      debt_interest_rate_pct: debt.interestRate,
      debt_balance_to_income: round(debt.balance / args.monthlyIncome, 4),
      debt_status: debt.status
    }))
  };
}

export async function getPaymentFeatures(userId: string): Promise<PaymentFeatureResult | null> {
  const parsed = Number(userId);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;

  const user = await prisma.users.findUnique({
    where: { user_id: parsed },
    select: { monthly_income: true }
  });
  if (!user) return null;

  const debts = await prisma.debts.findMany({
    where: { user_id: parsed },
    select: { debt_id: true, creditor_name: true, status: true, interest_rate: true, balance: true }
  });

  const payments = await prisma.paymentHistory.findMany({
    where: { debt_id: { in: debts.map((debt) => debt.debt_id) } },
    select: { debt_id: true, due_date: true, missed: true }
  });

  return buildPaymentFeatures({
    monthlyIncome: user.monthly_income ?? 0,
    debts: debts.map((debt) => ({
      debtId: debt.debt_id,
      creditorName: debt.creditor_name,
      status: debt.status,
      interestRate: debt.interest_rate,
      balance: debt.balance
    })),
    payments: payments.map((payment) => ({
      debtId: payment.debt_id,
      dueDate: payment.due_date,
      missed: payment.missed
    }))
  });
}
