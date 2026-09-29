import { askModel, figuresAllowed, randAmounts } from "@/lib/ai/model";
import { formatDate, formatZAR } from "@/lib/format";

// Letters to a creditor, drafted from the user's own figures.
//
// Three kinds, each with its own risk:
//   * Payment arrangement: asks to pay less for a while. The suggested amount is worked out, not
//     guessed — when the user is short, their available money is shared between creditors in
//     proportion to what each is owed monthly, which is how a debt counsellor would split it.
//   * Prescription notice: tells a creditor a debt has prescribed (three years without payment or
//     acknowledgement, under the Prescription Act) and may not be collected (National Credit Act,
//     s126B). Its wording is fixed and never sent to a model, because a sentence that
//     acknowledges the debt can restart prescription. The app's own payment history is checked
//     first: a payment inside three years means the debt has not prescribed, and the letter says
//     so rather than being drafted.
//   * Debt review notice: a courtesy letter. The formal notice (Form 17.1) comes from the debt
//     counsellor; this only asks the creditor to direct contact there.
//
// The model may improve the wording of the first and third only, and only if every rand figure
// it uses was already in the draft.

export type LetterKind = "arrangement" | "prescription" | "debt_review";

export type LetterFacts = {
  fullName: string;
  creditorName: string;
  debtType: string;
  balance: number;
  currentInstalment: number;
  /** The last payment actually made on this account, from the payment history. */
  lastPaidOn: Date | null;
  today: Date;
};

export type ArrangementOptions = { proposed: number; startDate: Date; circumstances: string };
export type DebtReviewOptions = { counsellorName: string; counsellorNcr: string; appliedOn: Date };

export type Letter = {
  kind: LetterKind;
  subject: string;
  body: string;
  /** Things the user must know before sending. */
  cautions: string[];
  /** A letter that must not be sent as it stands (a debt that has not prescribed). */
  blocked: string | null;
  source: "template" | "model";
};

const PRESCRIPTION_YEARS = 3;

/**
 * What to offer, from the plan: when the user is short, share what is available between
 * creditors in proportion to each one's instalment; otherwise the current instalment is
 * affordable and there is nothing to ask for.
 */
export function suggestedInstalment(args: { available: number; totalInstalments: number; thisInstalment: number }): {
  amount: number;
  reason: string;
} {
  if (args.totalInstalments <= 0 || args.thisInstalment <= 0) return { amount: 0, reason: "No instalment is recorded for this account." };
  if (args.available >= args.totalInstalments) {
    return { amount: args.thisInstalment, reason: "Your figures cover every instalment, so the current one is affordable." };
  }
  const share = args.thisInstalment / args.totalInstalments;
  const amount = Math.max(0, Math.floor((Math.max(0, args.available) * share) / 10) * 10);
  return {
    amount,
    reason: `What you have for repayments (${formatZAR(Math.max(0, args.available))}) shared between your creditors in proportion to each instalment — ${Math.round(share * 100)}% of it to this account.`
  };
}

export function prescriptionCheck(lastPaidOn: Date | null, today: Date): { prescribed: boolean; reason: string } {
  if (!lastPaidOn) {
    return { prescribed: false, reason: "FinAware has no payment history for this account, so it cannot check the three years. Confirm the last payment date from a statement before relying on prescription." };
  }
  const cutoff = new Date(today.getFullYear() - PRESCRIPTION_YEARS, today.getMonth(), today.getDate());
  return lastPaidOn <= cutoff
    ? { prescribed: true, reason: `The last payment on record was on ${formatDate(lastPaidOn)}, more than ${PRESCRIPTION_YEARS} years ago.` }
    : {
        prescribed: false,
        reason: `A payment was made on ${formatDate(lastPaidOn)}, less than ${PRESCRIPTION_YEARS} years ago, so this debt has not prescribed. Sending a prescription notice would be wrong.`
      };
}

const header = (facts: LetterFacts) =>
  [`${facts.fullName}`, "[Your address]", "[Your phone number or email]", "", formatDate(facts.today), "", `${facts.creditorName}`, "[Creditor's address or email]", ""].join("\n");

export function draftLetter(
  kind: LetterKind,
  facts: LetterFacts,
  options: { arrangement?: ArrangementOptions; debtReview?: DebtReviewOptions } = {}
): Letter {
  const reference = `Account: [your account number] (${facts.debtType})`;

  if (kind === "arrangement") {
    const plan = options.arrangement ?? { proposed: facts.currentInstalment, startDate: facts.today, circumstances: "" };
    const subject = `Request for a payment arrangement — ${facts.creditorName}`;
    const body = [
      header(facts),
      `Re: ${subject}`,
      reference,
      "",
      "Dear Sir or Madam",
      "",
      `I am writing about my account with you, on which about ${formatZAR(facts.balance)} is outstanding and the instalment is ${formatZAR(facts.currentInstalment)} a month.`,
      "",
      plan.circumstances.trim()
        ? plan.circumstances.trim()
        : "My circumstances have changed and I can no longer meet the full instalment together with my other commitments.",
      "",
      `I would like to propose a payment of ${formatZAR(plan.proposed)} a month, starting on ${formatDate(plan.startDate)}, which I can afford after my essential living costs and my other accounts. I ask that you consider freezing interest and fees while this arrangement is in place, and that no adverse action is taken on the account while you consider this request.`,
      "",
      "Please confirm in writing whether you accept this arrangement, and send me a statement of the account.",
      "",
      "Yours faithfully",
      "",
      facts.fullName
    ].join("\n");
    return {
      kind,
      subject,
      body,
      cautions: [
        "Only offer what you can keep paying every month. A broken arrangement is worse than none.",
        "Keep a copy, and ask for the creditor's acceptance in writing before you change the debit order."
      ],
      blocked: null,
      source: "template"
    };
  }

  if (kind === "prescription") {
    const check = prescriptionCheck(facts.lastPaidOn, facts.today);
    const subject = `Notice of prescribed debt — ${facts.creditorName}`;
    // Fixed wording: it states the law and asks for action, and never acknowledges the debt.
    const body = [
      header(facts),
      `Re: ${subject}`,
      reference,
      "",
      "Dear Sir or Madam",
      "",
      "I am writing about the account referred to above.",
      "",
      `More than ${PRESCRIPTION_YEARS} years have passed without payment, acknowledgement or the service of a summons. In terms of the Prescription Act 68 of 1969, the debt you claim has therefore prescribed.`,
      "",
      "Section 126B of the National Credit Act 34 of 2005 prohibits the collection of, and the request for payment of, a prescribed debt. I ask that you stop all collection activity on this account, including by any agent or debt collector acting for you, and that you ask the credit bureaus to correct any listing of the account.",
      "",
      "Nothing in this letter is an acknowledgement of any debt.",
      "",
      "Please confirm in writing that you have done so.",
      "",
      "Yours faithfully",
      "",
      facts.fullName
    ].join("\n");
    return {
      kind,
      subject,
      body,
      cautions: [
        "Do not make any payment on this account, and do not agree to one on the phone — either can restart prescription.",
        "If you have been served with a summons on this account, speak to a legal advisor instead of sending this letter.",
        check.reason
      ],
      blocked: check.prescribed ? null : check.reason,
      source: "template"
    };
  }

  const review = options.debtReview ?? { counsellorName: "[debt counsellor's name]", counsellorNcr: "[NCRDC number]", appliedOn: facts.today };
  const subject = `Notice of application for debt review — ${facts.creditorName}`;
  const body = [
    header(facts),
    `Re: ${subject}`,
    reference,
    "",
    "Dear Sir or Madam",
    "",
    `I write to let you know that on ${formatDate(review.appliedOn)} I applied for debt review in terms of section 86 of the National Credit Act, with ${review.counsellorName || "[debt counsellor's name]"} (registration ${review.counsellorNcr || "[NCRDC number]"}).`,
    "",
    "My debt counsellor will send you the formal notice. In the meantime, please direct communication about this account to my debt counsellor.",
    "",
    "Yours faithfully",
    "",
    facts.fullName
  ].join("\n");
  return {
    kind: "debt_review",
    subject,
    body,
    cautions: [
      "This is a courtesy letter only. The formal notice (Form 17.1) must come from your debt counsellor.",
      "Keep paying what you can until the counsellor's restructured plan is in place."
    ],
    blocked: null,
    source: "template"
  };
}

/** Improve the wording of a drafted letter, if a model is available and keeps every figure. */
export async function polishLetter(letter: Letter, fetchImpl?: typeof fetch): Promise<Letter> {
  // Never for prescription: one acknowledging sentence can restart it.
  if (letter.kind === "prescription" || letter.blocked) return letter;

  const figures = randAmounts(letter.body);
  const result = await askModel({
    task: "letter",
    system:
      "You improve the wording of a letter a South African consumer is sending to a creditor. Keep it formal, short and polite. Keep every placeholder in square brackets exactly as written. Keep every amount and date exactly. Do not add promises, admissions or amounts. Return the full letter.",
    user: letter.body,
    schema: {
      name: "letter",
      schema: { type: "object", additionalProperties: false, properties: { letter: { type: "string" } }, required: ["letter"] }
    },
    validate: (value) => {
      const text = (value as { letter?: unknown }).letter;
      if (typeof text !== "string" || text.length < letter.body.length * 0.6) return null;
      // Same money, and every placeholder the user still has to fill in is still there.
      const placeholders = letter.body.match(/\[[^\]]+\]/g) ?? [];
      return figuresAllowed(text, figures) && placeholders.every((placeholder) => text.includes(placeholder)) ? text : null;
    },
    timeoutMs: 20_000,
    fetchImpl
  });
  return result.ok ? { ...letter, body: result.value, source: "model" } : letter;
}
