import { monthlyPaymentFor, repaymentTerms } from "@/lib/finance/repayment";
import { buildRecommendation, type Recommendation } from "@/lib/budget/balance";

// Money plan: what to do with the income left after essentials.
//
// This is a deterministic rule engine, not a model. Every rand it allocates is traceable to a
// rule below, and the payoff figures come from simulating the same arithmetic a bank would use —
// month by month, interest first. Nothing here predicts a credit-score number: the app cannot
// know a bureau's scorecard, so it names the behaviours that drive scores and stops there.

export const BUDGET_RULES_VERSION = "1.0";

// Months of essentials a starter safety net should cover before extra money goes to debt.
// Below one month, a single surprise becomes new credit, which is what the plan is trying to stop.
const STARTER_BUFFER_MONTHS = 1;
const FULL_BUFFER_MONTHS = 3;

// Share of the surplus that may go to the starter buffer, so debt is never ignored entirely.
const BUFFER_SHARE_OF_SURPLUS = 0.5;

// A plan that leaves nothing for the unexpected fails on contact with reality.
const MIN_BREATHING_ROOM_RATIO = 0.05;

const PAYOFF_MONTH_LIMIT = 600;

export type EssentialCategory =
  | "housing"
  | "groceries"
  | "transport"
  | "utilities"
  | "healthcare"
  | "insurance"
  | "education"
  | "childcare"
  | "other";

export type EssentialItem = { category: EssentialCategory; amount: number };

export type PlanDebt = {
  debtId: number;
  creditor: string;
  balance: number;
  interestRate: number;
  /** Free-text type from the Debts table ("Bond", "Store Card"), which decides how it is repaid. */
  debtType?: string;
  /** An explicit monthly minimum always wins over anything inferred from the type. */
  minimumPayment?: number;
  /** Day of the month the debit order usually runs, from the payment history (South African time). */
  dueDay?: number;
};

export type PlanInput = {
  monthlyIncome: number;
  essentials: EssentialItem[];
  debts: PlanDebt[];
  savings: number;
  creditScore: number;
  /** From the missed-payment model, when available. Only changes wording, never amounts. */
  missedPaymentProbability?: number | null;
};

export type Allocation = {
  key: string;
  label: string;
  amount: number;
  reason: string;
  /** A named destination, e.g. the creditor an extra payment goes to. */
  target?: string;
  /** A numeric goal this allocation is working towards; formatted by the UI, not here. */
  targetAmount?: number;
};

export type CreditAction = { title: string; detail: string; why: string };

export type PayoffProjection = {
  monthsOnMinimums: number | null;
  monthsWithPlan: number | null;
  monthsSaved: number | null;
  interestOnMinimums: number;
  interestWithPlan: number;
  interestSaved: number;
};

export type MoneyPlan = {
  rulesVersion: string;
  monthlyIncome: number;
  essentialsTotal: number;
  essentialsShareOfIncome: number;
  debtMinimumsTotal: number;
  surplus: number;
  status: "deficit" | "tight" | "healthy";
  allocations: Allocation[];
  unallocated: number;
  bufferMonthsNow: number;
  /** Set only when status is "deficit": how much more goes out each month than comes in. */
  shortfall?: number;
  /** Where a monthly figure rests on an assumed repayment term, so the page can say so. */
  assumptions: string[];
  payoff: PayoffProjection | null;
  /** What to move, and where — the plan's actual advice. */
  recommendation: Recommendation;
  creditActions: CreditAction[];
  warnings: string[];
  /** The outstanding debts this plan was built on, so a change to it (a savings goal taking part
   *  of the extra payment) can be simulated with the same arithmetic. */
  debts: PlanDebt[];
  /** Savings the plan counted, for goals that build on them (an emergency fund). */
  savings: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function minimumFor(debt: PlanDebt): number {
  return monthlyPaymentFor(debt);
}

/**
 * Month-by-month payoff. Interest is charged on the balance first, then the payment is applied,
 * and the minimum is recalculated each month because it is a percentage of what is still owed.
 * `extraPerMonth` always goes to the highest-rate debt still open (the avalanche order, which
 * costs the least interest). It can be a function of the month (1-based) when the extra payment
 * changes over time — a savings goal that borrows from it for a year, then hands it back.
 */
export function simulatePayoff(
  debts: PlanDebt[],
  extraPerMonth: number | ((month: number) => number)
): { months: number | null; interest: number } {
  const extraFor = typeof extraPerMonth === "function" ? extraPerMonth : () => extraPerMonth;
  const open = debts
    .filter((debt) => debt.balance > 0)
    .map((debt) => ({
      balance: debt.balance,
      rate: debt.interestRate,
      debt,
      // An amortising payment is fixed for the life of the loan — paying extra shortens the term,
      // it does not reduce the instalment. A revolving minimum is recalculated every month
      // because it is a percentage of what is still owed.
      fixedPayment: repaymentTerms(debt.debtType).shape === "amortising" ? minimumFor(debt) : null
    }));
  if (open.length === 0) return { months: 0, interest: 0 };

  let interest = 0;

  for (let month = 1; month <= PAYOFF_MONTH_LIMIT; month += 1) {
    let extra = Math.max(0, extraFor(month));

    for (const account of open) {
      if (account.balance <= 0) continue;
      const monthlyInterest = (account.balance * (account.rate / 100)) / 12;
      account.balance += monthlyInterest;
      interest += monthlyInterest;
    }

    for (const account of open) {
      if (account.balance <= 0) continue;
      const due = account.fixedPayment ?? minimumFor({ ...account.debt, balance: account.balance });
      account.balance -= Math.min(account.balance, due);
    }

    // Whatever is left over attacks the most expensive debt still standing.
    while (extra > 0) {
      const target = open
        .filter((account) => account.balance > 0)
        .sort((a, b) => b.rate - a.rate)[0];
      if (!target) break;
      const payment = Math.min(target.balance, extra);
      target.balance -= payment;
      extra -= payment;
    }

    if (open.every((account) => account.balance <= 0.01)) {
      return { months: month, interest: round(interest) };
    }
  }

  // Minimums that never clear the balance: say so rather than printing a fake number.
  return { months: null, interest: round(interest) };
}

function creditActions(input: PlanInput, surplus: number, debts: PlanDebt[]): CreditAction[] {
  const actions: CreditAction[] = [];
  const totalBalance = debts.reduce((sum, debt) => sum + debt.balance, 0);
  const balanceToIncome = input.monthlyIncome > 0 ? totalBalance / input.monthlyIncome : 0;

  const missRisk = input.missedPaymentProbability ?? null;
  actions.push({
    title: "Pay every account on time, every month",
    detail:
      missRisk !== null && missRisk >= 0.3
        ? `Set up debit orders for the day after payday. Your payment history suggests a ${Math.round(missRisk * 100)}% chance of missing one this month, so automating is worth more than any extra payment.`
        : "Set up debit orders for the day after payday so a missed date can never be the reason your score drops.",
    why: "Payment history is the single largest factor in how a credit score is calculated."
  });

  if (balanceToIncome > 3) {
    actions.push({
      title: "Bring your balances down, not just your payments",
      detail: `You owe about ${balanceToIncome.toFixed(1)}× your monthly income. The plan below puts every spare rand against the most expensive debt first.`,
      why: "Scores respond to how much of your available credit you are using, not only to whether you pay."
    });
  }

  if (debts.length > 0) {
    actions.push({
      title: "Do not open new credit while you restructure",
      detail: "Avoid new store cards, loans and 'buy now, pay later' until the plan below has cleared at least one account.",
      why: "Each application is recorded, and new accounts lower the average age of your credit history."
    });
  }

  if (input.creditScore < 600) {
    actions.push({
      title: "Check your credit report for mistakes",
      detail:
        "You are entitled to a free credit report each year from South African bureaus. Accounts that are not yours, or settled debts still showing as open, can be disputed.",
      why: "Errors are common and correcting one changes your score without costing you anything."
    });
  }

  if (surplus > 0 && debts.length === 0) {
    actions.push({
      title: "Keep your oldest account open",
      detail: "With no debt to clear, leave a long-standing account active and use it lightly, paying it in full.",
      why: "A longer credit history helps; closing an old account shortens it."
    });
  }

  return actions;
}

export function buildMoneyPlan(input: PlanInput): MoneyPlan {
  const warnings: string[] = [];
  const essentialsTotal = round(input.essentials.reduce((sum, item) => sum + item.amount, 0));
  const debts = input.debts.filter((debt) => debt.balance > 0);
  const debtMinimumsTotal = round(debts.reduce((sum, debt) => sum + minimumFor(debt), 0));
  const surplus = round(input.monthlyIncome - essentialsTotal - debtMinimumsTotal);

  // Terms are not recorded anywhere, so any amortised figure is an assumption the user can see.
  const assumptions = debts
    .map((debt) => {
      const terms = repaymentTerms(debt.debtType);
      return debt.minimumPayment === undefined && terms.assumption
        ? `${debt.creditor}${debt.debtType ? ` (${debt.debtType})` : ""}: ${terms.assumption}.`
        : null;
    })
    .filter((note): note is string => note !== null);

  const monthlyEssentials = essentialsTotal > 0 ? essentialsTotal : input.monthlyIncome * 0.5;
  const bufferMonthsNow = monthlyEssentials > 0 ? round(input.savings / monthlyEssentials) : 0;

  const allocations: Allocation[] = [];

  if (input.monthlyIncome <= 0) {
    warnings.push("A monthly income is needed before a plan can be built.");
  }
  if (essentialsTotal === 0) {
    warnings.push("No essential expenses were entered, so the surplus below is likely overstated.");
  }
  if (essentialsTotal > input.monthlyIncome) {
    warnings.push("Your essentials alone exceed your income, before any debt repayment.");
  }

  if (surplus < 0) {
    return {
      rulesVersion: BUDGET_RULES_VERSION,
      monthlyIncome: round(input.monthlyIncome),
      essentialsTotal,
      essentialsShareOfIncome: input.monthlyIncome > 0 ? round(essentialsTotal / input.monthlyIncome) : 0,
      debtMinimumsTotal,
      surplus,
      status: "deficit",
      allocations: [],
      unallocated: 0,
      bufferMonthsNow,
      // A payoff projection would be dishonest here: the minimums are not affordable as it stands.
      payoff: null,
      creditActions: creditActions(input, surplus, debts),
      // The shortfall is a number, not a sentence: the page formats it as currency.
      shortfall: round(Math.abs(surplus)),
      recommendation: buildRecommendation({
        status: "deficit",
        shortfall: round(Math.abs(surplus)),
        surplus,
        monthlyIncome: input.monthlyIncome,
        essentials: input.essentials,
        allocations: [],
        debts
      }),
      assumptions,
      warnings,
      debts,
      savings: round(input.savings)
    };
  }

  let remaining = surplus;

  // Keep a little back. A plan that allocates the last rand is one missed taxi fare from failing.
  const breathingRoom = round(Math.min(remaining, input.monthlyIncome * MIN_BREATHING_ROOM_RATIO));
  if (breathingRoom > 0) {
    allocations.push({
      key: "breathing_room",
      label: "Leave unallocated",
      amount: breathingRoom,
      reason: "A small buffer for the irregular costs every month actually has, so the plan survives a surprise."
    });
    remaining = round(remaining - breathingRoom);
  }

  // 1. Starter safety net, capped so debt is never ignored while it is built.
  const starterTarget = round(monthlyEssentials * STARTER_BUFFER_MONTHS);
  if (input.savings < starterTarget && remaining > 0) {
    const gap = round(starterTarget - input.savings);
    const amount = round(Math.min(gap, surplus * BUFFER_SHARE_OF_SURPLUS, remaining));
    if (amount > 0) {
      allocations.push({
        key: "starter_buffer",
        label: "Build a starter safety net",
        amount,
        targetAmount: round(starterTarget),
        reason: `You have about ${bufferMonthsNow} months of essentials saved. Without a buffer, the next unexpected cost becomes new debt, which is what pushes a score down.`
      });
      remaining = round(remaining - amount);
    }
  }

  // 2. Everything else at the most expensive debt.
  const avalancheTarget = [...debts].sort((a, b) => b.interestRate - a.interestRate)[0];
  if (avalancheTarget && remaining > 0) {
    allocations.push({
      key: "extra_debt",
      label: "Extra payment on your most expensive debt",
      amount: remaining,
      target: `${avalancheTarget.creditor} (${avalancheTarget.interestRate.toFixed(2)}% interest)`,
      reason:
        "Paying the highest interest rate first clears the debt for the least money. Keep paying the minimum on the others.",
    });
    remaining = 0;
  }

  // 3. No debt: finish the buffer, then save.
  if (!avalancheTarget && remaining > 0) {
    const fullTarget = round(monthlyEssentials * FULL_BUFFER_MONTHS);
    const savedSoFar = input.savings + allocations.reduce((sum, a) => (a.key === "starter_buffer" ? sum + a.amount : sum), 0);
    if (savedSoFar < fullTarget) {
      const amount = round(Math.min(fullTarget - savedSoFar, remaining));
      allocations.push({
        key: "full_buffer",
        label: "Grow your emergency fund",
        amount,
        targetAmount: fullTarget,
        reason: "With no debt to clear, three months of cover is the usual next goal."
      });
      remaining = round(remaining - amount);
    }
    if (remaining > 0) {
      allocations.push({
        key: "long_term",
        label: "Save or invest the rest",
        amount: remaining,
        reason: "Your essentials are covered, your debts are clear and your emergency fund is funded."
      });
      remaining = 0;
    }
  }

  const extraToDebt = allocations.find((a) => a.key === "extra_debt")?.amount ?? 0;
  const onMinimums = simulatePayoff(debts, 0);
  const withPlan = simulatePayoff(debts, extraToDebt);

  const payoff: PayoffProjection | null =
    debts.length === 0
      ? null
      : {
          monthsOnMinimums: onMinimums.months,
          monthsWithPlan: withPlan.months,
          monthsSaved:
            onMinimums.months !== null && withPlan.months !== null ? onMinimums.months - withPlan.months : null,
          interestOnMinimums: onMinimums.interest,
          interestWithPlan: withPlan.interest,
          interestSaved: round(onMinimums.interest - withPlan.interest)
        };

  return {
    rulesVersion: BUDGET_RULES_VERSION,
    monthlyIncome: round(input.monthlyIncome),
    essentialsTotal,
    essentialsShareOfIncome: input.monthlyIncome > 0 ? round(essentialsTotal / input.monthlyIncome) : 0,
    debtMinimumsTotal,
    surplus,
    status: surplus < input.monthlyIncome * 0.1 ? "tight" : "healthy",
    allocations,
    unallocated: remaining,
    bufferMonthsNow,
    payoff,
    assumptions,
    recommendation: buildRecommendation({
      status: surplus < input.monthlyIncome * 0.1 ? "tight" : "healthy",
      shortfall: 0,
      surplus,
      monthlyIncome: input.monthlyIncome,
      essentials: input.essentials,
      allocations,
      debts
    }),
    creditActions: creditActions(input, surplus, debts),
    warnings,
    debts,
    savings: round(input.savings)
  };
}
