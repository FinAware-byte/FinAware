import { DebtStatus, type AppDebt } from "@/lib/domain";

// Credit score, calculated from the accounts on record — never entered by hand.
//
// Why this exists: the score used to be a stored number that a user could type into the Identity
// form, and for seeded users it came from randomInt() inside a band picked off the ID number. It
// was not a consequence of anything. That made it meaningless on its own, and actively misleading
// once the risk model started scoring on it.
//
// The weights below follow the shape of a conventional credit score (payment history dominates,
// then how much is owed), restricted to facts this application actually records. Anything it does
// not record — enquiry counts, account ages in months, bureau-specific adjustments — is left out
// rather than guessed at. This is a model of a credit score, not a bureau score, and the UI says so.
//
// Scale: 300–850, matching the range the risk model was trained on.

export const SCORE_MIN = 300;
export const SCORE_MAX = 850;

export type ScoreFactor = {
  key: "paymentHistory" | "amountsOwed" | "historyLength" | "creditMix" | "publicRecords";
  label: string;
  /** Share of the total score this factor can move. */
  weight: number;
  /** 0–1: how well this user scores on this factor. */
  value: number;
  /** Points this factor contributed, out of `weight * 550`. */
  points: number;
  /** The recorded figure behind `value`, for showing the working. */
  basis: string;
};

export type CreditScoreBreakdown = {
  score: number;
  band: "Poor" | "Fair" | "Good" | "Excellent";
  factors: ScoreFactor[];
};

export type ScoreInput = {
  monthlyIncome: number;
  debts: Array<
    Pick<
      AppDebt,
      | "status"
      | "balance"
      | "monthlyObligation"
      | "paymentsMadeCount"
      | "totalPaymentsCount"
      | "missedPaymentsCount"
      | "hasLegalJudgment"
      // The type as stored ("Bond", "Vehicle Finance"), never the normalised debtType: that maps
      // anything unrecognised to OTHER, which collapsed three different accounts into one and cost
      // the user points on account mix. Naming the field explicitly means a caller cannot pass the
      // normalised value by accident — the two are both strings, so only the name catches it.
      | "debtTypeStored"
    >
  >;
};

/**
 * Whether a Legal_Records row counts as a judgment against the score. The one definition every
 * path uses — the stored score, the Score Coach page and the seed once disagreed (any record vs
 * "Judgment" only), which gave the same user two different scores. Garnishee orders are left out
 * on purpose: they are already scored through the GARNISHED debt status, and counting the record
 * as well would charge for them twice. Summonses and disputes are not judgments.
 */
export function isJudgmentRecord(recordType: string): boolean {
  return /judge?ment/i.test(recordType);
}

const WEIGHTS = {
  paymentHistory: 0.35,
  amountsOwed: 0.3,
  historyLength: 0.15,
  creditMix: 0.1,
  publicRecords: 0.1
} as const;

const RANGE = SCORE_MAX - SCORE_MIN; // 550 points of movement

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Linear falloff: `best` scores 1, `worst` scores 0, values between interpolate. */
function scale(value: number, best: number, worst: number): number {
  if (worst === best) return value <= best ? 1 : 0;
  return clamp01((worst - value) / (worst - best));
}

function bandFor(score: number): CreditScoreBreakdown["band"] {
  if (score >= 740) return "Excellent";
  if (score >= 670) return "Good";
  if (score >= 580) return "Fair";
  return "Poor";
}

export function calculateCreditScore(input: ScoreInput): CreditScoreBreakdown {
  const debts = input.debts ?? [];
  const income = Number.isFinite(input.monthlyIncome) ? Math.max(0, input.monthlyIncome) : 0;

  // 1. Payment history (35%) — the single biggest factor, as in a real score.
  const totalPayments = debts.reduce((sum, debt) => sum + Math.max(0, debt.totalPaymentsCount), 0);
  const missedPayments = debts.reduce((sum, debt) => sum + Math.max(0, debt.missedPaymentsCount), 0);
  const missRate = totalPayments > 0 ? missedPayments / totalPayments : 0;
  // A quarter of payments missed is the floor: past that the factor is already 0, so further
  // misses cannot keep dragging a score that is beyond rescue on this factor alone.
  // No payments on record is a thin file, not a clean one — it scores 0.6, not 1.
  const paymentHistory = totalPayments === 0 ? 0.6 : scale(missRate, 0, 0.25);

  // 2. Amounts owed (30%) — what the accounts cost every month against what comes in.
  // Every account is counted, not just ACTIVE ones. A garnishee order is taken off the salary
  // before it is paid and a reconsidered debt is still being repaid, so filtering to ACTIVE made
  // the most distressed borrowers look as though they owed nothing at all. Status is a factor in
  // its own right below; it is not a reason to drop an obligation from the total.
  const monthlyObligations = debts.reduce((sum, debt) => sum + Math.max(0, debt.monthlyObligation), 0);
  const dti = income > 0 ? monthlyObligations / income : monthlyObligations > 0 ? 1 : 0;
  // Under 15% of income is comfortable; at 60% the account load is unsustainable.
  const amountsOwed = debts.length === 0 ? 1 : scale(dti, 0.15, 0.6);

  // 3. Length of history (15%) — payments on record stand in for account age, which is the
  // closest proxy available: the app records due dates per payment, not account opening dates.
  const historyLength = 0.3 + 0.7 * clamp01(totalPayments / 48);

  // 4. Credit mix (10%) — a spread of account types reads better than a single type.
  const distinctTypes = new Set(
    debts.map((debt) => String(debt.debtTypeStored ?? "").trim().toUpperCase()).filter((type) => type.length > 0)
  ).size;
  const creditMix = debts.length === 0 ? 0.5 : clamp01(0.4 + 0.2 * distinctTypes);

  // 5. Public records (10%) — judgments and garnishee orders, the most damaging marks there are.
  const judgments = debts.filter((debt) => debt.hasLegalJudgment).length;
  const garnished = debts.filter((debt) => debt.status === DebtStatus.GARNISHED).length;
  const reconsidered = debts.filter((debt) => debt.status === DebtStatus.RECONSIDERED).length;
  const publicRecords = clamp01(1 - 0.5 * Math.min(2, judgments) - 0.35 * Math.min(2, garnished) - 0.1 * Math.min(2, reconsidered));

  const raw: Array<Omit<ScoreFactor, "points">> = [
    {
      key: "paymentHistory",
      label: "Payment history",
      weight: WEIGHTS.paymentHistory,
      value: paymentHistory,
      basis:
        totalPayments === 0
          ? "no payments on record yet"
          : `${missedPayments} missed of ${totalPayments} payments (${(missRate * 100).toFixed(1)}%)`
    },
    {
      key: "amountsOwed",
      label: "What you owe",
      weight: WEIGHTS.amountsOwed,
      value: amountsOwed,
      basis: debts.length === 0 ? "no accounts on record" : `repayments are ${(dti * 100).toFixed(1)}% of income`
    },
    {
      key: "historyLength",
      label: "Length of history",
      weight: WEIGHTS.historyLength,
      value: historyLength,
      basis: `${totalPayments} payment${totalPayments === 1 ? "" : "s"} on record`
    },
    {
      key: "creditMix",
      label: "Account mix",
      weight: WEIGHTS.creditMix,
      value: creditMix,
      basis:
        debts.length === 0
          ? "no accounts on record"
          : `${distinctTypes} account type${distinctTypes === 1 ? "" : "s"} across ${debts.length} account${debts.length === 1 ? "" : "s"}`
    },
    {
      key: "publicRecords",
      label: "Judgments and orders",
      weight: WEIGHTS.publicRecords,
      value: publicRecords,
      basis:
        judgments + garnished + reconsidered === 0
          ? "none on record"
          : `${judgments} judgment${judgments === 1 ? "" : "s"}, ${garnished} garnishee order${garnished === 1 ? "" : "s"}`
    }
  ];

  const factors: ScoreFactor[] = raw.map((factor) => ({
    ...factor,
    points: Math.round(factor.weight * RANGE * factor.value)
  }));

  const weighted = raw.reduce((sum, factor) => sum + factor.weight * factor.value, 0);
  const score = Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(SCORE_MIN + RANGE * weighted)));

  return { score, band: bandFor(score), factors };
}

/** The score alone, for the many callers that do not need the breakdown. */
export function creditScoreFor(input: ScoreInput): number {
  return calculateCreditScore(input).score;
}
