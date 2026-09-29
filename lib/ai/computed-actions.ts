import type { AppDebt, AppUser } from "@/lib/domain";
import { simulatePayoff, type PlanDebt } from "@/lib/budget/plan";
import { formatZAR } from "@/lib/format";
import type { WorkingLine } from "@/types/working";

// Recommendations with actual rands in them, worked out from the user's own accounts.
//
// Why this is not left to the language model: every figure below is arithmetic on real balances
// and rates — what one account costs in interest this month, what an extra payment saves, how
// many months it removes. A model handed raw JSON can only estimate those in its head, and a
// wrong rand figure in financial guidance is worse than no figure at all. The model's job, when
// there is an API key, is to phrase what is computed here; the numbers are never its invention.

export type ComputedAction = {
  /** Full sentence — used for the model prompt and as plain-text output. */
  text: string;
  /** The single figure this action turns on, so the interface can show its working. */
  basis: string;
  /** What to do, in a few words. */
  headline: string;
  /** The figure itself, kept separate so the interface can set it as a number rather than
   *  bury it mid-sentence. */
  amount?: string;
  amountLabel?: string;
  /** The reasoning underneath. */
  detail: string;
  /** The arithmetic, line by line, for "Why this?". Same figures as the sentence, never others. */
  working: WorkingLine[];
  tone: "urgent" | "opportunity" | "steady";
};

export type ComputedHeadline = { amount: string; label: string; sentence: string };

function monthlyInterest(debt: Pick<AppDebt, "balance" | "interestRate">): number {
  return (debt.balance * (debt.interestRate / 100)) / 12;
}

function toPlanDebt(debt: AppDebt): PlanDebt {
  return {
    debtId: debt.debtId,
    creditor: debt.creditorName,
    balance: debt.balance,
    interestRate: debt.interestRate,
    minimumPayment: debt.monthlyObligation
  };
}

export function computedActions(args: {
  user: Pick<AppUser, "monthlyIncome" | "creditScore">;
  debts: AppDebt[];
  netCashflow: number | null;
}): ComputedAction[] {
  const actions: ComputedAction[] = [];
  const active = args.debts.filter((debt) => debt.balance > 0);
  if (active.length === 0) return actions;

  const byRate = [...active].sort((a, b) => b.interestRate - a.interestRate);
  const dearest = byRate[0];
  const interestThisMonth = monthlyInterest(dearest);

  // 1. Name the most expensive account and what it costs to carry for one more month.
  actions.push({
    text: `Put every spare rand against ${dearest.creditorName} at ${dearest.interestRate.toFixed(2)}% — it is costing you ${formatZAR(interestThisMonth)} in interest this month alone, before anything comes off the balance.`,
    basis: `${formatZAR(dearest.balance)} × ${dearest.interestRate.toFixed(2)}% ÷ 12`,
    headline: `Attack ${dearest.creditorName} first`,
    amount: formatZAR(interestThisMonth),
    amountLabel: "interest this month alone",
    detail: `At ${dearest.interestRate.toFixed(2)}% it is your most expensive debt. That interest is charged before a cent comes off the ${formatZAR(dearest.balance)} balance.`,
    working: [
      { label: `${dearest.creditorName} balance`, value: formatZAR(dearest.balance) },
      {
        label: active.length > 1 ? `× Interest rate (highest of your ${active.length} accounts)` : "× Interest rate",
        value: `${dearest.interestRate.toFixed(2)}%`
      },
      { label: "÷ Months in a year", value: "12" },
      { label: "= Interest this month", value: formatZAR(interestThisMonth), result: true },
      ...(byRate[1]
        ? [{ label: `Next most expensive: ${byRate[1].creditorName}`, value: `${byRate[1].interestRate.toFixed(2)}%` }]
        : [])
    ],
    tone: "urgent"
  });

  // 2. What a specific, affordable extra payment actually buys.
  const surplus = args.netCashflow;
  if (surplus !== null && surplus > 0) {
    const extra = Math.round(Math.min(surplus, args.user.monthlyIncome * 0.1) / 50) * 50;
    if (extra >= 50) {
      const plain = simulatePayoff(active.map(toPlanDebt), 0);
      const faster = simulatePayoff(active.map(toPlanDebt), extra);
      if (plain.months !== null && faster.months !== null && faster.months < plain.months) {
        const saved = Math.round(plain.interest - faster.interest);
        actions.push({
          text: `Adding ${formatZAR(extra)} a month on top of your minimums clears your debt in ${faster.months} months instead of ${plain.months}, and saves about ${formatZAR(saved)} in interest.`,
          basis: `${formatZAR(extra)} extra per month, highest interest rate first`,
          headline: `Add ${formatZAR(extra)} a month and finish ${plain.months - faster.months} months sooner`,
          amount: formatZAR(saved),
          amountLabel: "interest you would never pay",
          detail: `Debt-free in ${faster.months} months instead of ${plain.months}, for ${formatZAR(extra)} a month you already have spare.`,
          working: [
            { label: "Spare each month", value: formatZAR(surplus) },
            { label: "Extra payment (the smaller of that and 10% of income, to the nearest R50)", value: formatZAR(extra) },
            { label: "Minimums only", value: `${plain.months} months · ${formatZAR(plain.interest)} interest` },
            { label: "With the extra, highest rate first", value: `${faster.months} months · ${formatZAR(faster.interest)} interest` },
            { label: "= Interest saved", value: formatZAR(saved), result: true },
            { label: "= Months sooner", value: String(plain.months - faster.months), result: true }
          ],
          tone: "opportunity"
        });
      }
    }
  } else if (surplus !== null && surplus < 0) {
    actions.push({
      text: `Your income does not cover your expenses and minimum payments — you are ${formatZAR(Math.abs(surplus))} short each month. Closing that gap comes before any extra payment.`,
      basis: `income less expenses and minimum repayments`,
      headline: "Close the monthly gap before anything else",
      amount: formatZAR(Math.abs(surplus)),
      amountLabel: "short every month",
      detail: "Your income does not cover your expenses and minimum payments. Extra payments come after this is fixed.",
      working: [
        { label: "Income − expenses − minimum repayments", value: formatZAR(surplus) },
        { label: "= Short every month", value: formatZAR(Math.abs(surplus)), result: true }
      ],
      tone: "urgent"
    });
  }

  // 3. Missed payments, counted rather than alluded to.
  const missed = active.reduce((sum, debt) => sum + debt.missedPaymentsCount, 0);
  if (missed > 0) {
    const worst = [...active].sort((a, b) => b.missedPaymentsCount - a.missedPaymentsCount)[0];
    actions.push({
      text: `You have ${missed} missed payment${missed === 1 ? "" : "s"} on record, ${worst.missedPaymentsCount} of them on ${worst.creditorName}. A debit order the day after payday stops the single biggest thing pulling your score down.`,
      basis: `${missed} missed payment${missed === 1 ? "" : "s"} across ${active.length} account${active.length === 1 ? "" : "s"}`,
      headline: "Set a debit order for the day after payday",
      amount: String(missed),
      amountLabel: missed === 1 ? "missed payment on record" : "missed payments on record",
      detail: `${worst.missedPaymentsCount} of them on ${worst.creditorName}. Payment history is the single largest factor in a credit score, so this is worth more than any extra payment.`,
      working: [
        ...active
          .filter((debt) => debt.missedPaymentsCount > 0)
          .sort((a, b) => b.missedPaymentsCount - a.missedPaymentsCount)
          .map((debt) => ({
            label: debt.creditorName,
            value: `${debt.missedPaymentsCount} of ${debt.totalPaymentsCount} missed`
          })),
        { label: "= Missed payments on record", value: String(missed), result: true }
      ],
      tone: "urgent"
    });
  } else {
    actions.push({
      text: `Every payment on record has been made on time. Keeping that unbroken is worth more to your score than any extra payment.`,
      basis: `no missed payments on record`,
      headline: "Keep your payment record unbroken",
      amount: "0",
      amountLabel: "missed payments",
      detail: "Every payment on record has been made on time. Protecting that is worth more to your score than any extra payment.",
      working: [
        {
          label: "Payments on record",
          value: String(active.reduce((sum, debt) => sum + debt.totalPaymentsCount, 0))
        },
        { label: "= Missed", value: "0", result: true }
      ],
      tone: "steady"
    });
  }

  // 4. The smallest balance, when clearing one account outright is within reach.
  const smallest = [...active].sort((a, b) => a.balance - b.balance)[0];
  if (smallest.debtId !== dearest.debtId && surplus !== null && surplus > 0 && smallest.balance <= surplus * 6) {
    const months = Math.ceil(smallest.balance / surplus);
    actions.push({
      text: `${smallest.creditorName} is your smallest balance at ${formatZAR(smallest.balance)} — about ${months} month${months === 1 ? "" : "s"} of your surplus would close it and free up ${formatZAR(smallest.monthlyObligation)} a month.`,
      basis: `${formatZAR(smallest.balance)} ÷ ${formatZAR(surplus)} surplus`,
      headline: `Clear ${smallest.creditorName} outright`,
      amount: formatZAR(smallest.monthlyObligation),
      amountLabel: "a month freed up for good",
      detail: `At ${formatZAR(smallest.balance)} it is your smallest balance — roughly ${months} month${months === 1 ? "" : "s"} of your surplus closes the account entirely.`,
      working: [
        { label: `${smallest.creditorName} balance`, value: formatZAR(smallest.balance) },
        { label: "÷ Spare each month", value: formatZAR(surplus) },
        { label: "= Months to clear (rounded up)", value: String(months), result: true },
        { label: "= Repayment freed afterwards, every month", value: formatZAR(smallest.monthlyObligation), result: true }
      ],
      tone: "opportunity"
    });
  }

  return actions;
}

export function computedHeadline(args: {
  user: Pick<AppUser, "monthlyIncome" | "creditScore">;
  debts: AppDebt[];
}): ComputedHeadline | null {
  const active = args.debts.filter((debt) => debt.balance > 0);
  if (active.length === 0) return null;

  const totalInterest = active.reduce((sum, debt) => sum + monthlyInterest(debt), 0);
  const share = args.user.monthlyIncome > 0 ? Math.round((totalInterest / args.user.monthlyIncome) * 100) : 0;

  return {
    amount: formatZAR(totalInterest),
    label: "goes to interest every month",
    sentence: `Across ${active.length} account${active.length === 1 ? "" : "s"}${share > 0 ? `, about ${share}% of everything you earn` : ""}. None of it reduces what you owe.`
  };
}

export function computedSummary(args: {
  user: Pick<AppUser, "monthlyIncome" | "creditScore">;
  debts: AppDebt[];
  netCashflow: number | null;
}): string {
  const active = args.debts.filter((debt) => debt.balance > 0);
  if (active.length === 0) {
    return "You have no active debt on record. The priority now is keeping it that way and building a buffer.";
  }

  const totalInterest = active.reduce((sum, debt) => sum + monthlyInterest(debt), 0);
  const share = args.user.monthlyIncome > 0 ? Math.round((totalInterest / args.user.monthlyIncome) * 100) : 0;

  return `Interest alone costs you ${formatZAR(totalInterest)} a month across ${active.length} account${active.length === 1 ? "" : "s"}${share > 0 ? `, about ${share}% of your income` : ""}. Every rand below is aimed at bringing that down.`;
}
