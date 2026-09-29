import { estimateMonthlyObligation } from "@/lib/simulation/generator";

// How much a debt actually costs per month depends on what kind of debt it is.
//
// The dashboard's estimate (interest + 1.5% of the balance) describes revolving credit — a store
// card or overdraft, where the minimum tracks the balance. Applied to a bond it is badly wrong:
// a R2 000 000 bond comes out at about R45 000 a month instead of the ~R18 000 a 20-year
// repayment actually costs, which pushes almost every user into a false deficit.
//
// Amortising debts are therefore repaid on the standard annuity formula, and revolving ones keep
// the existing estimate. The dashboard is left exactly as it is; only the money plan uses this.

export type RepaymentShape = "amortising" | "revolving";

export type RepaymentTerms = {
  shape: RepaymentShape;
  /** Full standard term in months. The remaining term is not recorded anywhere, so the plan
   *  assumes a debt taken out today — stated in the UI rather than hidden. */
  termMonths?: number;
  /** Plain-language note for the interface when the figure rests on an assumption. */
  assumption?: string;
};

const HOME_LOAN_MONTHS = 240; // 20 years
const VEHICLE_MONTHS = 72; // 6 years
const PERSONAL_LOAN_MONTHS = 60; // 5 years

// Matched against the free-text debt_type the app stores ("Bond", "Vehicle Finance", ...).
const RULES: { match: RegExp; terms: RepaymentTerms }[] = [
  {
    match: /bond|mortgage|home loan|property (loan|facility)/i,
    terms: {
      shape: "amortising",
      termMonths: HOME_LOAN_MONTHS,
      assumption: "repaid over a standard 20-year term"
    }
  },
  {
    match: /vehicle|fleet|equipment/i,
    terms: {
      shape: "amortising",
      termMonths: VEHICLE_MONTHS,
      assumption: "repaid over a standard 6-year term"
    }
  },
  {
    match: /personal loan|business|student|acquisition|bridge|working capital/i,
    terms: {
      shape: "amortising",
      termMonths: PERSONAL_LOAN_MONTHS,
      assumption: "repaid over a standard 5-year term"
    }
  },
  // Cards, overdrafts and arrears genuinely do work as a percentage of the balance.
  { match: /card|overdraft|facility|arrears|account|policy|maintenance|informal/i, terms: { shape: "revolving" } }
];

export function repaymentTerms(debtType: string | undefined): RepaymentTerms {
  if (!debtType) return { shape: "revolving" };
  return RULES.find((rule) => rule.match.test(debtType))?.terms ?? { shape: "revolving" };
}

/**
 * The standard annuity payment: what a bank charges each month to clear `balance` over
 * `termMonths` at `annualRate`. A zero-rate debt is simply the balance spread over the term.
 */
export function amortisedPayment(balance: number, annualRate: number, termMonths: number): number {
  if (balance <= 0 || termMonths <= 0) return 0;
  const monthlyRate = annualRate / 100 / 12;
  if (monthlyRate <= 0) return Number((balance / termMonths).toFixed(2));
  const factor = Math.pow(1 + monthlyRate, -termMonths);
  return Number(((balance * monthlyRate) / (1 - factor)).toFixed(2));
}

/** The monthly payment for a debt, chosen by what kind of debt it is. */
export function monthlyPaymentFor(args: {
  balance: number;
  interestRate: number;
  debtType?: string;
  minimumPayment?: number;
}): number {
  if (args.minimumPayment !== undefined) return args.minimumPayment;
  const terms = repaymentTerms(args.debtType);
  if (terms.shape === "amortising" && terms.termMonths) {
    return amortisedPayment(args.balance, args.interestRate, terms.termMonths);
  }
  return estimateMonthlyObligation(args.balance, args.interestRate);
}
