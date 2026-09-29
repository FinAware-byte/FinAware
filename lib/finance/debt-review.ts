import type { AppDebt } from "@/lib/domain";
import { formatZAR } from "@/lib/format";
import type { WorkingLine } from "@/types/working";

// Debt-review screener: would this user be likely to qualify for debt review under the National
// Credit Act, and why.
//
// The test a debt counsellor applies is section 79: a consumer is over-indebted when they will be
// unable to meet all their credit obligations on time, judged on their income, their other
// commitments and their repayment history. So the core of this screen is one piece of arithmetic —
// income, less living costs and payments that debt review cannot touch, less the credit repayments
// it can — and the verdict follows from the sign of the answer.
//
// This is a screen, not an assessment. Only a registered debt counsellor can declare someone
// over-indebted, and the page says so. What the screen adds is the working: which accounts a
// counsellor could include and which they could not, and the shortfall in rands.

export type ScreenerDebt = Pick<
  AppDebt,
  "debtId" | "creditorName" | "debtTypeStored" | "balance" | "monthlyObligation" | "status" | "missedPaymentsCount" | "totalPaymentsCount"
>;

export type ScreenerInput = {
  monthlyIncome: number;
  /** Living costs excluding debt repayments. Null when the user has not given them. */
  monthlyExpenses: number | null;
  debts: ScreenerDebt[];
  /** Legal_Records.record_type for this user ("Summons", "Judgment", "Garnishee order", …). */
  legalRecordTypes: string[];
};

export type Inclusion = "yes" | "maybe" | "no";

export type ScreenedAccount = {
  debtId: number;
  creditor: string;
  type: string;
  balance: number;
  monthly: number;
  inclusion: Inclusion;
  why: string;
};

export type Verdict = "likely" | "possible" | "unlikely" | "not_suitable" | "need_info";

export type LegalFlag = { record: string; message: string };

export type DebtReviewScreen = {
  verdict: Verdict;
  headline: string;
  summary: string;
  /** Income less everything, per month. Negative means over-indebted on the numbers. */
  leftOver: number | null;
  working: WorkingLine[];
  accounts: ScreenedAccount[];
  legalFlags: LegalFlag[];
  missedPayments: number;
  /** What changes if the user goes ahead, so the decision is made knowing the cost. */
  consequences: string[];
};

// Margins the screen treats as "a counsellor would look closely". Not thresholds in the Act,
// which sets none; they only separate "clearly not" from "worth asking".
const THIN_MARGIN = 0.1;
const MISSED_MARGIN = 0.25;

type Category = { inclusion: Inclusion; why: string; outsideReview: boolean };

// Stored debt types are free text ("Store Card", "Utility Arrears", "Commercial Mortgage"), so
// they are classified by what they are, not matched against a fixed list.
export function classifyDebtType(stored: string): Category {
  const type = stored.trim().toLowerCase();

  if (/funeral|insurance|policy|assurance/.test(type)) {
    return {
      inclusion: "no",
      outsideReview: true,
      why: "An insurance premium, not a credit agreement. It keeps being paid in full, so it counts against what is left for your creditors."
    };
  }
  if (/maintenance/.test(type)) {
    return {
      inclusion: "no",
      outsideReview: true,
      why: "Court-ordered maintenance is not credit and must keep being paid in full. A counsellor counts it as a fixed commitment."
    };
  }
  if (/utility|municipal|rates|water|electricity|sars|tax/.test(type)) {
    return {
      inclusion: "no",
      outsideReview: true,
      why: "Municipal and tax accounts are not credit agreements under the Act. They are paid outside debt review."
    };
  }
  if (/telecom|cell|phone|medical|hospital|doctor|school/.test(type)) {
    return {
      inclusion: "maybe",
      outsideReview: false,
      why: "Usually treated as incidental credit, which counsellors normally include. The counsellor will confirm from the statement."
    };
  }
  if (/commercial|business|corporate|fleet|working capital|bridge|expansion|lombard|equipment/.test(type)) {
    return {
      inclusion: "maybe",
      outsideReview: false,
      why: "The Act covers credit in your own name. If this was signed by a company rather than by you personally, it is outside debt review."
    };
  }
  if (/informal|mashonisa/.test(type)) {
    return {
      inclusion: "maybe",
      outsideReview: false,
      why: "Only a lender registered with the National Credit Regulator can be included. A loan from an unregistered lender may not be enforceable at all — tell the counsellor about it."
    };
  }
  if (/card|loan|vehicle|finance|overdraft|mortgage|bond|home|student|credit|account|facility/.test(type)) {
    return { inclusion: "yes", outsideReview: false, why: "A credit agreement under the Act, so it can be restructured." };
  }
  return {
    inclusion: "maybe",
    outsideReview: false,
    why: "Not a type the screen recognises. A counsellor will check whether it is a credit agreement."
  };
}

// Legal steps already taken change what debt review can do, and the timing matters, so each is
// flagged in words rather than folded silently into the verdict.
function legalFlagsFor(records: string[]): LegalFlag[] {
  const flags: LegalFlag[] = [];
  const has = (pattern: RegExp) => records.some((record) => pattern.test(record));

  if (has(/summons/i)) {
    flags.push({
      record: "Summons",
      message:
        "A creditor has started legal action. An account already in legal enforcement can be excluded from debt review, so speak to a counsellor before anything else — timing matters here."
    });
  }
  if (has(/judge?ment/i)) {
    flags.push({
      record: "Judgment",
      message:
        "A judgment has been granted. That account cannot simply be restructured with the rest; a counsellor can advise on settling it and applying for the judgment to be rescinded."
    });
  }
  if (has(/garnishee/i)) {
    flags.push({
      record: "Garnishee order",
      message:
        "A garnishee order is being taken from your salary. It keeps running unless it is varied or rescinded, so a counsellor has to plan around it."
    });
  }
  if (has(/debt review/i)) {
    flags.push({
      record: "Debt review inquiry",
      message:
        "There is a debt review inquiry on your record. If you are already under debt review you cannot apply again — contact the counsellor handling it."
    });
  }
  return flags;
}

const CONSEQUENCES = [
  "You cannot take on new credit until you receive a clearance certificate at the end.",
  "You are flagged as under debt review at the credit bureaus for as long as it runs.",
  "You make one monthly payment, which a payment distribution agency splits between your creditors.",
  "Creditors cannot take legal action on the included accounts while the process is followed."
];

export function screenDebtReview(input: ScreenerInput): DebtReviewScreen {
  const income = Number.isFinite(input.monthlyIncome) ? Math.max(0, input.monthlyIncome) : 0;
  const outstanding = input.debts.filter((debt) => debt.balance > 0);
  const legalFlags = legalFlagsFor(input.legalRecordTypes);
  const missedPayments = outstanding.reduce((sum, debt) => sum + Math.max(0, debt.missedPaymentsCount), 0);

  const accounts: ScreenedAccount[] = outstanding.map((debt) => {
    const category = classifyDebtType(debt.debtTypeStored);
    const garnished = debt.status === "GARNISHED";
    return {
      debtId: debt.debtId,
      creditor: debt.creditorName,
      type: debt.debtTypeStored,
      balance: debt.balance,
      monthly: Math.max(0, debt.monthlyObligation),
      // A garnished account has a judgment behind it. It stays in the sums — the deduction is
      // real — but it cannot be restructured like the others.
      inclusion: garnished && category.inclusion !== "no" ? "maybe" : category.inclusion,
      why: garnished && category.inclusion !== "no"
        ? "A garnishee order is already in place on this account, so a judgment stands behind it. A counsellor has to deal with it separately."
        : category.why
    };
  });

  const outside = accounts.filter((account) => account.inclusion === "no");
  const reviewable = accounts.filter((account) => account.inclusion !== "no");
  const outsidePayments = outside.reduce((sum, account) => sum + account.monthly, 0);
  const reviewablePayments = reviewable.reduce((sum, account) => sum + account.monthly, 0);

  const base = { accounts, legalFlags, missedPayments, consequences: CONSEQUENCES };

  if (income <= 0) {
    return {
      ...base,
      verdict: "not_suitable",
      headline: "Debt review needs an income to work",
      summary:
        "Debt review replaces your repayments with one smaller monthly amount, so it needs an income to pay that from. With no income on record, a debt counsellor can still advise you — ask about other options through Get Help.",
      leftOver: null,
      working: [{ label: "Monthly income", value: formatZAR(income) }]
    };
  }

  if (input.monthlyExpenses === null) {
    return {
      ...base,
      verdict: "need_info",
      headline: "We need your living costs first",
      summary:
        "Whether you qualify turns on what is left after your living costs. Add your monthly expenses to your financial profile and this check will work it out.",
      leftOver: null,
      working: [
        { label: "Monthly income", value: formatZAR(income) },
        { label: "− Credit repayments", value: formatZAR(reviewablePayments) },
        { label: "Living expenses", value: "not given" }
      ]
    };
  }

  const expenses = Math.max(0, input.monthlyExpenses);
  const available = income - expenses - outsidePayments;
  const leftOver = available - reviewablePayments;
  const margin = leftOver / income;

  const working: WorkingLine[] = [
    { label: "Monthly income", value: formatZAR(income) },
    { label: "− Living expenses", value: formatZAR(expenses) },
    ...(outsidePayments > 0
      ? [{ label: "− Payments debt review cannot cover", value: formatZAR(outsidePayments) }]
      : []),
    { label: "= Available for credit repayments", value: formatZAR(available), result: true },
    { label: "− Credit repayments debt review could cover", value: formatZAR(reviewablePayments) },
    {
      label: leftOver < 0 ? "= Short every month" : "= Left over every month",
      value: formatZAR(Math.abs(leftOver)),
      result: true
    }
  ];

  const withWorking = { ...base, leftOver, working };

  if (reviewable.length === 0) {
    return {
      ...withWorking,
      verdict: "unlikely",
      headline: "Nothing here that debt review could restructure",
      summary:
        "Debt review only covers credit agreements, and none of your accounts is one. If these payments are hard to meet, a payment arrangement with each account holder is the route."
    };
  }

  if (leftOver < 0) {
    return {
      ...withWorking,
      verdict: "likely",
      headline: "You are likely to qualify for debt review",
      summary: `After your living costs and the payments debt review cannot touch, you are ${formatZAR(Math.abs(leftOver))} short of your credit repayments every month. That is what over-indebted means under the Act: you cannot meet all your repayments on time.`
    };
  }

  if (margin < THIN_MARGIN || (missedPayments > 0 && margin < MISSED_MARGIN)) {
    return {
      ...withWorking,
      verdict: "possible",
      headline: "You might qualify — a counsellor would look closely",
      summary:
        missedPayments > 0
          ? `On paper you have ${formatZAR(leftOver)} left each month, but ${missedPayments} missed payment${missedPayments === 1 ? "" : "s"} on record suggest the repayments are not being met on time in practice. The Act looks at repayment history as well as the sums.`
          : `On paper you have ${formatZAR(leftOver)} left each month — under ${Math.round(THIN_MARGIN * 100)}% of your income. One unexpected cost would tip you over, and a counsellor would look closely at whether your living costs are realistic.`
    };
  }

  return {
    ...withWorking,
    verdict: "unlikely",
    headline: "You are unlikely to qualify, and probably do not need to",
    summary: `After everything, you have ${formatZAR(leftOver)} left each month. Debt review is for people who cannot meet their repayments; you can, and it would stop you taking new credit for years. The Money Plan shows how to use that surplus to clear debt faster instead.`
  };
}
