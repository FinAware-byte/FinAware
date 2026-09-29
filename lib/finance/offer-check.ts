import { formatZAR } from "@/lib/format";
import type { WorkingLine } from "@/types/working";

// Loan offer check: paste an SMS, WhatsApp message or loan offer and find out (1) whether what it
// costs is more than the National Credit Act allows, and (2) whether it carries the marks of a
// scam or a loan shark.
//
// The cost check is arithmetic against the published limits, not a judgement: it works out the
// most a registered lender may legally charge for the same amount and term — interest at the cap
// plus the maximum initiation and service fees, with VAT — and compares the offer with that. An
// offer can only be called illegal when it costs more than every legal charge added together.
//
// The red flags are plain patterns. Each is shown with the words that triggered it, so a false
// alarm is visible for what it is.

// ---------------------------------------------------------------------------------------------
// The limits.

export type CreditType = "short_term" | "unsecured" | "credit_facility" | "mortgage" | "other";

export const NCA_LIMITS = {
  source: "National Credit Regulations: Limitations on Fees and Interest Rates (GN R1080, in force 6 May 2016)",
  /** Maximum interest. "repoPlus" caps are a yearly rate: the repo rate plus this margin. */
  interest: {
    mortgage: { repoPlus: 12 },
    credit_facility: { repoPlus: 14 },
    unsecured: { repoPlus: 21 },
    other: { repoPlus: 17 },
    // Short-term credit is capped per month: 5% on a first loan, 3% on further loans in the
    // same calendar year. The check uses 5%, the more lenient, so it never over-accuses.
    short_term: { perMonth: 5 }
  },
  /** Excluding VAT. */
  serviceFeePerMonth: 60,
  /** Non-mortgage initiation fee, excluding VAT: R165 plus 10% of the amount above R1 000, at most R1 050. */
  initiationFee: { base: 165, share: 0.1, above: 1000, max: 1050 },
  vat: 0.15,
  /** The Act's definition: at most R8 000, repayable within six months. */
  shortTerm: { maxAmount: 8000, maxMonths: 6 }
} as const;

const CREDIT_TYPE_LABELS: Record<CreditType, string> = {
  short_term: "Short-term loan",
  unsecured: "Unsecured personal loan",
  credit_facility: "Credit card, store card or overdraft",
  mortgage: "Home loan",
  other: "Vehicle or other secured finance"
};

export function creditTypeLabel(type: CreditType): string {
  return CREDIT_TYPE_LABELS[type];
}

/** The yearly interest cap for a credit type, or the monthly one for short-term credit. */
export function interestCap(type: CreditType, repoRatePercent: number): { perMonth: number; label: string } {
  if (type === "short_term") {
    const perMonth = NCA_LIMITS.interest.short_term.perMonth;
    return { perMonth: perMonth / 100, label: `${perMonth}% a month` };
  }
  const yearly = repoRatePercent + NCA_LIMITS.interest[type].repoPlus;
  return {
    perMonth: yearly / 100 / 12,
    label: `${yearly.toFixed(2)}% a year (repo ${repoRatePercent.toFixed(2)}% + ${NCA_LIMITS.interest[type].repoPlus}%)`
  };
}

function initiationFeeCap(amount: number): number {
  const { base, share, above, max } = NCA_LIMITS.initiationFee;
  return Math.min(max, base + share * Math.max(0, amount - above)) * (1 + NCA_LIMITS.vat);
}

// ---------------------------------------------------------------------------------------------
// Reading the offer.

export type ParsedOffer = {
  amount: number | null;
  repayTotal: number | null;
  instalment: number | null;
  termMonths: number | null;
  statedRate: { percent: number; per: "month" | "year" | "term" } | null;
  creditType: CreditType | null;
  understood: string[];
};

const AMOUNT = String.raw`R\s?(\d{1,3}(?:[ , ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(k)?\b`;

function toRand(digits: string, decimals: string | undefined, thousands: string | undefined): number {
  const whole = Number(digits.replace(/[\s, ]/g, ""));
  const value = decimals ? Number(`${whole}.${decimals}`) : whole;
  return Math.round(value * (thousands ? 1000 : 1) * 100) / 100;
}

function firstAmount(text: string, before: string, after = ""): { value: number; words: string } | null {
  const match = new RegExp(`${before}${AMOUNT}${after}`, "i").exec(text);
  return match ? { value: toRand(match[1], match[2], match[3]), words: match[0].trim() } : null;
}

const NUMBER_WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, twelve: 12 };

function termFrom(text: string): { months: number; words: string } | null {
  const counted = /\b(\d+|a|one|two|three|four|five|six|twelve)\s*(days?|weeks?|months?|years?)\b/i.exec(text);
  if (counted) {
    const count = NUMBER_WORDS[counted[1].toLowerCase()] ?? Number(counted[1]);
    const unit = counted[2].toLowerCase();
    const months = unit.startsWith("day") ? count / 30 : unit.startsWith("week") ? (count * 7) / 30 : unit.startsWith("year") ? count * 12 : count;
    if (months > 0) return { months: Math.round(months * 100) / 100, words: counted[0] };
  }
  const payday = /\b(end of (?:the )?month|month[- ]end|payday|next pay ?day|next month)\b/i.exec(text);
  return payday ? { months: 1, words: payday[0] } : null;
}

function creditTypeFrom(text: string): CreditType | null {
  if (/\b(bond|home loan|mortgage)\b/i.test(text)) return "mortgage";
  if (/\b(credit card|store card|overdraft|revolving)\b/i.test(text)) return "credit_facility";
  if (/\b(vehicle|car finance|instalment sale|installment sale)\b/i.test(text)) return "other";
  return null;
}

// The first rand amount in the text that is not one of the figures already accounted for.
function firstOtherAmount(text: string, taken: number[]): { value: number; words: string } | null {
  for (const match of text.matchAll(new RegExp(AMOUNT, "gi"))) {
    const value = toRand(match[1], match[2], match[3]);
    if (!taken.includes(value)) return { value, words: match[0].trim() };
  }
  return null;
}

export function parseOffer(text: string): ParsedOffer {
  const understood: string[] = [];

  const instalment =
    firstAmount(text, "", String.raw`\s*(?:per\s+month|p\/m|pm\b|a\s+month|monthly|x\s*\d+)`) ??
    firstAmount(text, String.raw`\b(?:\d+|six|twelve)\s+(?:monthly\s+)?(?:instal+ments?|payments?)\s+of\s+`);
  const repaid = instalment
    ? null
    : firstAmount(text, String.raw`\b(?:pay(?:\s+it)?\s+back|repay(?:ment)?(?:\s+of)?|return|total(?:\s+to\s+pay|\s+repayable|\s+of)?|you\s+pay|settle(?:ment)?(?:\s+of)?)\s+(?:only\s+|just\s+)?`);

  // What is lent: an amount after "borrow", "loan of" and the like, or else the first amount that
  // is not the repayment or the instalment.
  const lent =
    firstAmount(text, String.raw`\b(?:borrow|loan(?:\s+of)?|lend(?:ing)?(?:\s+you)?|get|receive|cash(?:\s+loan)?(?:\s+of)?|up\s+to)\s+(?:up\s+to\s+|only\s+)?`) ??
    firstOtherAmount(text, [instalment?.value, repaid?.value].filter((value): value is number => value !== undefined));
  if (lent) understood.push(lent.words);
  if (instalment) understood.push(instalment.words);
  if (repaid) understood.push(repaid.words);

  const term = termFrom(text);
  if (term) understood.push(term.words);

  const rate = /(\d+(?:[.,]\d+)?)\s*%\s*(?:interest\s*)?(per\s+month|p\.?\s?m\.?(?=\W|$)|monthly|a\s+month|per\s+(?:year|annum)|p\.?\s?a\.?(?=\W|$)|a\s+year|annual(?:ly)?)?/i.exec(text);
  let statedRate: ParsedOffer["statedRate"] = null;
  if (rate) {
    // No period at all ("50% interest") is how loan sharks quote: a flat charge on the loan.
    const unit = rate[2]?.toLowerCase() ?? "";
    const per = !unit ? "term" : /year|annum|annual|p\.?\s?a/.test(unit) ? "year" : "month";
    statedRate = { percent: Number(rate[1].replace(",", ".")), per };
    understood.push(rate[0].trim());
  }

  return {
    amount: lent?.value ?? null,
    repayTotal: repaid?.value ?? null,
    instalment: instalment?.value ?? null,
    termMonths: term?.months ?? null,
    statedRate,
    creditType: creditTypeFrom(text),
    understood
  };
}

// ---------------------------------------------------------------------------------------------
// Red flags.

export type FlagSeverity = "scam" | "warning";

export type RedFlag = { key: string; severity: FlagSeverity; title: string; why: string; words: string };

const FLAGS: Array<{ key: string; severity: FlagSeverity; pattern: RegExp; title: string; why: string }> = [
  {
    key: "upfront_fee",
    severity: "scam",
    pattern:
      /\b(?:upfront|up-front|advance|admin(?:istration)?|processing|insurance|registration|release|clearance|activation)\s+(?:fee|payment|deposit)\b|\bpay\s+(?:a\s+|the\s+)?(?:fee|deposit)\s+(?:first|before|upfront)|\b(?:fee|deposit)\s+(?:before|to\s+release|to\s+process|to\s+activate)/i,
    title: "Asks for money before paying out",
    why: "A real lender takes its fees from the loan or adds them to your repayments. Being asked to pay first to 'release' a loan is the most common loan scam in South Africa — the loan never arrives."
  },
  {
    key: "keeps_card",
    severity: "scam",
    pattern: /\b(?:keep|hold|leave|hand\s+over|bring|give\s+us)\b[^.]{0,30}\b(?:id\s*(?:book|card|document)?|identity\s+document|bank\s+card|sassa\s+card|pin)\b/i,
    title: "Wants to keep your ID or bank card",
    why: "It is illegal under the National Credit Act for a lender to hold your ID, bank card or PIN. It is how loan sharks take your pay before you see it."
  },
  {
    key: "otp",
    severity: "scam",
    pattern: /\b(?:otp|one[- ]time\s+pin|pin\s+number|password|verification\s+code)\b/i,
    title: "Asks for a PIN, password or one-time code",
    why: "No lender needs your PIN or one-time code. Anyone who has them can empty your account."
  },
  {
    key: "odd_payment",
    severity: "scam",
    pattern: /\b(?:e-?wallet|cash\s?send|instant\s+money|airtime|vouchers?|gift\s+cards?|bitcoin|crypto(?:currency)?|money\s?gram|western\s+union)\b/i,
    title: "Wants payment by voucher, e-wallet or airtime",
    why: "Registered lenders collect by debit order or EFT into a business account. These methods cannot be traced or reversed, which is why scammers ask for them."
  },
  {
    key: "no_credit_check",
    severity: "warning",
    pattern: /\bno\s+credit\s+checks?\b|\bblacklisted\s+(?:welcome|ok|okay|accepted|qualify)\b|\bguaranteed\s+(?:approval|loan|payout)\b|\b100%\s+approv/i,
    title: "Promises no credit check or guaranteed approval",
    why: "A registered lender must check that you can afford the loan; lending without that check is reckless lending under the Act. A promise to skip it means a scam or a lender breaking the law."
  },
  {
    key: "pressure",
    severity: "warning",
    pattern: /\b(?:today\s+only|act\s+now|urgent(?:ly)?|limited\s+(?:time|offer)|expires?\s+(?:today|tonight)|within\s+24\s?h(?:ou)?rs?|last\s+chance|reply\s+now)\b/i,
    title: "Pushes you to decide immediately",
    why: "Pressure to act now is meant to stop you checking the lender or reading the agreement. A real offer will still be there tomorrow."
  },
  {
    key: "personal_contact",
    severity: "warning",
    pattern: /\bwhats\s?app\b|@(?:gmail|yahoo|hotmail|outlook)\.com\b/i,
    title: "Uses WhatsApp or a personal email address",
    why: "Registered lenders trade under a business name, with a landline, a website and a company email address."
  },
  {
    key: "threat",
    severity: "warning",
    pattern: /\b(?:or\s+else|we\s+will\s+come|your\s+family|we\s+know\s+where|police\s+will|you\s+will\s+be\s+arrested)\b/i,
    title: "Threatens you",
    why: "Threats and intimidation are illegal debt collection. You can report them to the National Credit Regulator."
  }
];

function redFlags(text: string): RedFlag[] {
  return FLAGS.flatMap((flag) => {
    const match = flag.pattern.exec(text);
    return match ? [{ key: flag.key, severity: flag.severity, title: flag.title, why: flag.why, words: match[0].trim() }] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// The check.

export type OfferInput = {
  amount: number;
  /** One of these two: the total paid back, or a monthly instalment paid for `termMonths`. */
  repayTotal: number | null;
  instalment: number | null;
  termMonths: number;
  creditType: CreditType;
  text: string;
};

export type OfferVerdict = "scam" | "over_limit" | "caution" | "no_flags" | "need_info";

export type OfferCheck = {
  verdict: OfferVerdict;
  headline: string;
  summary: string;
  flags: RedFlag[];
  ncrNumber: string | null;
  cost: {
    offerTotal: number;
    legalMaxTotal: number;
    /** Positive when the offer costs more than the law allows. */
    excess: number;
    costPerMonthPercent: number;
    capLabel: string;
    working: WorkingLine[];
  } | null;
};

function amortisedPayment(principal: number, monthlyRate: number, months: number): number {
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

export function checkOffer(input: OfferInput, repoRatePercent: number): OfferCheck {
  const flags = redFlags(input.text);
  const ncr = /\bNCRCP\s?\d{2,6}\b/i.exec(input.text);
  const ncrNumber = ncr ? ncr[0].toUpperCase().replace(/\s/g, "") : null;

  const months = input.termMonths;
  const offerTotal =
    input.instalment !== null && months > 0 ? input.instalment * Math.max(1, Math.round(months)) : input.repayTotal;

  let cost: OfferCheck["cost"] = null;
  if (input.amount > 0 && months > 0 && offerTotal !== null && offerTotal > 0) {
    const cap = interestCap(input.creditType, repoRatePercent);
    const feeMonths = Math.max(1, Math.ceil(months - 1e-9));
    const serviceFees = NCA_LIMITS.serviceFeePerMonth * (1 + NCA_LIMITS.vat) * feeMonths;
    const initiation = input.creditType === "mortgage" ? 0 : initiationFeeCap(input.amount);

    // The most a registered lender could charge for this amount and term. Instalment loans are
    // amortised at the cap with the initiation fee financed; a single repayment carries simple
    // interest at the cap for the term.
    const legalMaxTotal =
      input.instalment !== null
        ? amortisedPayment(input.amount + initiation, cap.perMonth, Math.max(1, Math.round(months))) * Math.max(1, Math.round(months)) + serviceFees
        : input.amount + input.amount * cap.perMonth * months + initiation + serviceFees;
    const legalInterest = legalMaxTotal - input.amount - initiation - serviceFees;

    const excess = Math.round((offerTotal - legalMaxTotal) * 100) / 100;
    const costPerMonthPercent = ((offerTotal - input.amount) / input.amount / months) * 100;
    const termLabel = months < 1 ? `${Math.round(months * 30)} days` : `${months} month${months === 1 ? "" : "s"}`;

    cost = {
      offerTotal,
      legalMaxTotal,
      excess,
      costPerMonthPercent,
      capLabel: cap.label,
      working: [
        { label: "You borrow", value: formatZAR(input.amount) },
        {
          label:
            input.instalment !== null
              ? `You pay back (${formatZAR(input.instalment)} × ${Math.max(1, Math.round(months))})`
              : `You pay back after ${termLabel}`,
          value: formatZAR(offerTotal)
        },
        { label: "= What the loan costs you", value: formatZAR(offerTotal - input.amount), result: true },
        { label: `Most interest allowed (${cap.label})`, value: formatZAR(legalInterest) },
        ...(initiation > 0 ? [{ label: "+ Most initiation fee allowed, with VAT", value: formatZAR(initiation) }] : []),
        { label: `+ Most service fees allowed (R${NCA_LIMITS.serviceFeePerMonth} a month, with VAT)`, value: formatZAR(serviceFees) },
        { label: "= The most a registered lender may charge", value: formatZAR(legalMaxTotal - input.amount), result: true },
        {
          label: excess > 0 ? "Over the legal maximum by" : "Under the legal maximum by",
          value: formatZAR(Math.abs(excess)),
          result: true
        }
      ]
    };
  }

  const scamFlags = flags.filter((flag) => flag.severity === "scam");

  if (scamFlags.length > 0) {
    return {
      verdict: "scam",
      headline: "This looks like a scam",
      summary: `${scamFlags.map((flag) => flag.title.toLowerCase()).join(", and ")}. Do not send money, codes or documents. A registered lender never works this way.`.replace(/^./, (c) => c.toUpperCase()),
      flags,
      ncrNumber,
      cost
    };
  }

  // Home-loan initiation fees are capped on a different scale that this check does not carry, so
  // leaving them out would understate what is legal. A home loan is never called illegal here.
  if (cost && cost.excess > 1 && input.creditType !== "mortgage") {
    return {
      verdict: "over_limit",
      headline: "This costs more than the law allows",
      summary: `Paying back ${formatZAR(cost.offerTotal)} for ${formatZAR(input.amount)} is ${formatZAR(cost.excess)} more than a registered lender may charge, even with every fee at its maximum. That is the mark of an unregistered lender — a loan shark.`,
      flags,
      ncrNumber,
      cost
    };
  }

  if (!cost) {
    return {
      verdict: flags.length > 0 ? "caution" : "need_info",
      headline: flags.length > 0 ? "Be careful with this one" : "Add the amounts to check the cost",
      summary:
        flags.length > 0
          ? "It has warning signs below. To check whether the cost is legal, fill in what you borrow, what you pay back and over how long."
          : "No warning signs in the wording. To check whether the cost is legal, fill in what you borrow, what you pay back and over how long.",
      flags,
      ncrNumber,
      cost
    };
  }

  if (flags.length > 0 || !ncrNumber) {
    return {
      verdict: "caution",
      headline: "The cost is within the law — but check the lender",
      summary: !ncrNumber
        ? "The cost is within the legal maximum, but the offer shows no NCR registration number. Every registered lender has one (it starts NCRCP). Ask for it before you sign anything."
        : "The cost is within the legal maximum, but the wording has the warning signs below.",
      flags,
      ncrNumber,
      cost
    };
  }

  return {
    verdict: "no_flags",
    headline: "No warning signs found",
    summary: `The cost is within the legal maximum and the wording has none of the usual warning signs. Before signing, check ${ncrNumber} on the National Credit Regulator's register — scammers copy real numbers.`,
    flags,
    ncrNumber,
    cost
  };
}

/** Fill the gaps a pasted message leaves, the way the check needs them. */
export function offerInputFrom(parsed: ParsedOffer): Omit<OfferInput, "text"> | null {
  if (parsed.amount === null) return null;
  let months = parsed.termMonths;
  let repayTotal = parsed.repayTotal;

  // A stated rate with no repayment figure: work the repayment out from it.
  if (repayTotal === null && parsed.instalment === null && parsed.statedRate) {
    const rate = parsed.statedRate.percent / 100;
    const term = months ?? 1;
    months = term;
    repayTotal =
      parsed.statedRate.per === "term"
        ? parsed.amount * (1 + rate)
        : parsed.statedRate.per === "month"
          ? parsed.amount * (1 + rate * term)
          : parsed.amount * (1 + (rate / 12) * term);
  }
  if (months === null) return null;

  const creditType =
    parsed.creditType ??
    (parsed.amount <= NCA_LIMITS.shortTerm.maxAmount && months <= NCA_LIMITS.shortTerm.maxMonths ? "short_term" : "unsecured");

  return { amount: parsed.amount, repayTotal, instalment: parsed.instalment, termMonths: months, creditType };
}
