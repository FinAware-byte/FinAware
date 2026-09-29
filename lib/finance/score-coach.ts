import { calculateCreditScore, type CreditScoreBreakdown, type ScoreInput } from "@/lib/finance/credit-score";
import { formatZAR } from "@/lib/format";

// Score coach: which single thing moves this user's score most, and by how many points.
//
// The whole answer is arithmetic on the same calculation that produces the score, so every number
// here is checkable: each factor's headroom is the points it is currently giving up, and the
// "what it would take" line is derived by solving the factor back to the figure it needs. Nothing
// is estimated and nothing is asked of a language model — a coach that guesses at point values is
// worse than no coach.

export type CoachStep = {
  factorKey: CreditScoreBreakdown["factors"][number]["key"];
  title: string;
  /** Points currently being given up on this factor. */
  headroom: number;
  /** What the user is doing now. */
  current: string;
  /** The concrete change, with its figure. */
  action: string;
  /** Why this factor matters, in the user's terms. */
  why: string;
  /** True when the user cannot act on this directly (time has to pass). */
  waitingOnTime: boolean;
};

export type ScoreCoaching = {
  score: number;
  band: CreditScoreBreakdown["band"];
  /** Points available across every factor — the gap to 850. */
  totalHeadroom: number;
  /** Ordered by points available, biggest first. */
  steps: CoachStep[];
  /** The one to do first, or null when the score is already at the ceiling. */
  topStep: CoachStep | null;
  /** Points to the next band up, and the band's name. */
  toNextBand: { points: number; band: string } | null;
};

const BAND_FLOORS: Array<{ floor: number; band: string }> = [
  { floor: 740, band: "Excellent" },
  { floor: 670, band: "Good" },
  { floor: 580, band: "Fair" }
];

function nextBand(score: number): ScoreCoaching["toNextBand"] {
  // Floors are highest-first, so the last one still above the score is the next rung up.
  const target = [...BAND_FLOORS].reverse().find((entry) => entry.floor > score);
  return target ? { points: target.floor - score, band: target.band } : null;
}

export function coachCreditScore(input: ScoreInput): ScoreCoaching {
  const breakdown = calculateCreditScore(input);
  const debts = input.debts ?? [];
  const income = Math.max(0, input.monthlyIncome || 0);

  const totalPayments = debts.reduce((sum, debt) => sum + Math.max(0, debt.totalPaymentsCount), 0);
  const missedPayments = debts.reduce((sum, debt) => sum + Math.max(0, debt.missedPaymentsCount), 0);
  const obligations = debts.reduce((sum, debt) => sum + Math.max(0, debt.monthlyObligation), 0);
  const dti = income > 0 ? obligations / income : 0;

  // Repayments at 15% of income is where the "amounts owed" factor stops losing points, so the
  // gap to that figure is the actual monthly reduction being asked for.
  const comfortable = income * 0.15;
  const reduceBy = Math.max(0, obligations - comfortable);

  const steps: CoachStep[] = breakdown.factors.map((factor) => {
    const headroom = Math.round(factor.weight * 550 * (1 - factor.value));

    switch (factor.key) {
      case "paymentHistory":
        return {
          factorKey: factor.key,
          title: missedPayments > 0 ? "Stop the missed payments" : "Keep every payment on time",
          headroom,
          current:
            totalPayments === 0
              ? "No payments on record yet"
              : `${missedPayments} missed of ${totalPayments} payments`,
          action:
            missedPayments > 0
              ? "Set a debit order for the day after payday on every account. Missed payments stay on record, so the score recovers as clean months replace them."
              : "Every payment on record is on time. A single miss would cost more than any other action here gains.",
          why: "Payment history is the largest single factor, worth up to 193 of the 550 points on offer.",
          waitingOnTime: missedPayments > 0
        };

      case "amountsOwed":
        return {
          factorKey: factor.key,
          title: "Bring monthly repayments down",
          headroom,
          current: income > 0 ? `Repayments are ${(dti * 100).toFixed(1)}% of your income` : "No income on record",
          action:
            reduceBy > 0
              ? `Reducing repayments by ${formatZAR(reduceBy)} a month would take you to 15% of income, where this factor stops costing points. Clearing the smallest account is usually the fastest way there.`
              : "Your repayments are already comfortable against your income.",
          why: "What you owe each month is the second largest factor, worth up to 165 points.",
          waitingOnTime: false
        };

      case "historyLength":
        return {
          factorKey: factor.key,
          title: "Let your history build",
          headroom,
          current: `${totalPayments} payment${totalPayments === 1 ? "" : "s"} on record`,
          action:
            totalPayments >= 48
              ? "Your history is long enough to score full marks here."
              : `This factor fills up at 48 payments on record. You are ${48 - totalPayments} away — it improves on its own, as long as they are paid on time.`,
          why: "A longer record gives a lender more to go on. It is worth up to 83 points.",
          waitingOnTime: totalPayments < 48
        };

      case "creditMix": {
        const types = new Set(debts.map((debt) => debt.debtTypeStored)).size;
        return {
          factorKey: factor.key,
          title: "Account mix",
          headroom,
          current:
            debts.length === 0
              ? "No accounts on record"
              : `${types} type${types === 1 ? "" : "s"} across ${debts.length} account${debts.length === 1 ? "" : "s"}`,
          action:
            "Worth the fewest points of any factor. Do not open an account to improve it — the repayment would cost you more on the factor above than you would gain here.",
          why: "A spread of account types reads slightly better, but it is only worth up to 55 points.",
          waitingOnTime: false
        };
      }

      case "publicRecords": {
        const judgments = debts.filter((debt) => debt.hasLegalJudgment).length;
        const garnished = debts.filter((debt) => debt.status === "GARNISHED").length;
        return {
          factorKey: factor.key,
          title: judgments + garnished > 0 ? "Deal with the judgments" : "Keep your record clear",
          headroom,
          current:
            judgments + garnished === 0
              ? "No judgments or garnishee orders"
              : `${judgments} judgment${judgments === 1 ? "" : "s"}, ${garnished} garnishee order${garnished === 1 ? "" : "s"}`,
          action:
            judgments + garnished > 0
              ? "Once a judgment debt is settled you can apply to have it rescinded. Speak to a debt counsellor through Get Help — this is not something to do alone."
              : "Nothing on record against you. This is worth protecting.",
          why: "Judgments and garnishee orders are the most damaging marks a record can carry.",
          waitingOnTime: judgments + garnished > 0
        };
      }
    }
  });

  // Biggest win first. A factor with no headroom left has nothing to offer, so it sorts last.
  const ordered = [...steps].sort((a, b) => b.headroom - a.headroom);
  const totalHeadroom = steps.reduce((sum, step) => sum + step.headroom, 0);

  return {
    score: breakdown.score,
    band: breakdown.band,
    totalHeadroom,
    steps: ordered,
    topStep: ordered[0] && ordered[0].headroom > 0 ? ordered[0] : null,
    toNextBand: nextBand(breakdown.score)
  };
}
