import { askModel, figuresAllowed, randAmounts } from "@/lib/ai/model";
import type { AppDebt } from "@/lib/domain";
import type { DebtReviewScreen } from "@/lib/finance/debt-review";
import { formatZAR } from "@/lib/format";

// Case summary: a one-page brief a user can hand to a counsellor or advisor, so the first
// conversation starts from the facts instead of from zero.
//
// Built entirely from what FinAware already holds and has already calculated — the same debt
// review arithmetic as the Debt Review Check, the same stored risk result — so the brief cannot
// disagree with the pages the user has seen. Legal matters go first because they carry deadlines.
// The ID number is deliberately left out: the advisor will ask for it through their own process.
// The language model may write the opening paragraph, from these facts only; any rand amount it
// uses must be one of the figures below, or the calculated paragraph is used.

export type CaseFacts = {
  firstName: string;
  age: number;
  employmentStatus: string;
  monthlyIncome: number;
  monthlyExpenses: number | null;
  savings: number | null;
  creditScore: number;
  debts: Array<
    Pick<AppDebt, "creditorName" | "debtTypeStored" | "balance" | "interestRate" | "monthlyObligation" | "status" | "missedPaymentsCount" | "totalPaymentsCount">
  >;
  legalRecordTypes: string[];
  risk: { level: string; score: number; assessedAt: string; drivers: string[] } | null;
  debtReview: Pick<DebtReviewScreen, "verdict" | "headline" | "leftOver">;
  request: { assistanceType: string | null; message: string | null } | null;
  preparedAt: Date;
};

export type CaseSummary = {
  narrative: string;
  narrativeSource: "calculated" | "model";
  urgent: string[];
  sections: Array<{ title: string; rows: Array<{ label: string; value: string }> }>;
  debts: Array<{ creditor: string; type: string; balance: string; rate: string; monthly: string; status: string; record: string }>;
  totals: { balance: number; monthly: number; missed: number };
  plainText: string;
  /** Every rand figure in the brief — the only ones a written paragraph may use. */
  figures: number[];
};

const EMPLOYMENT: Record<string, string> = {
  EMPLOYED: "employed",
  SELF_EMPLOYED: "self-employed",
  UNEMPLOYED: "not employed",
  STUDENT: "a student",
  RETIRED: "retired"
};

function urgentMatters(facts: CaseFacts, missed: number): string[] {
  const has = (pattern: RegExp) => facts.legalRecordTypes.some((type) => pattern.test(type));
  const garnished = facts.debts.filter((debt) => debt.status === "GARNISHED");
  return [
    has(/summons/i) && "A summons is on record. Check the date it was served: there is a deadline to respond.",
    has(/judge?ment/i) && "A judgment has been granted against the client.",
    (has(/garnishee/i) || garnished.length > 0) &&
      `A garnishee order is being deducted from salary${garnished.length > 0 ? ` (${garnished.map((debt) => debt.creditorName).join(", ")})` : ""}.`,
    has(/debt review/i) && "A debt review inquiry is already on record — check whether the client is under review.",
    facts.debtReview.leftOver !== null &&
      facts.debtReview.leftOver < 0 &&
      `Short by ${formatZAR(Math.abs(facts.debtReview.leftOver))} a month after living costs and repayments.`,
    missed > 0 && `${missed} missed payment${missed === 1 ? "" : "s"} on record.`
  ].filter((line): line is string => Boolean(line));
}

export function buildCaseSummary(facts: CaseFacts): CaseSummary {
  const outstanding = facts.debts.filter((debt) => debt.balance > 0);
  const totalBalance = outstanding.reduce((sum, debt) => sum + debt.balance, 0);
  const totalMonthly = outstanding.reduce((sum, debt) => sum + debt.monthlyObligation, 0);
  const missed = outstanding.reduce((sum, debt) => sum + debt.missedPaymentsCount, 0);
  const leftOver = facts.debtReview.leftOver;
  const employment = EMPLOYMENT[facts.employmentStatus] ?? facts.employmentStatus.toLowerCase().replace(/_/g, " ");

  const narrative = [
    `${facts.firstName} is ${facts.age}, ${employment}, with a take-home income of ${formatZAR(facts.monthlyIncome)} a month.`,
    facts.monthlyExpenses !== null ? `Living costs are ${formatZAR(facts.monthlyExpenses)} a month.` : "Living costs have not been entered.",
    `${outstanding.length} account${outstanding.length === 1 ? "" : "s"} with ${formatZAR(totalBalance)} outstanding cost ${formatZAR(totalMonthly)} a month`,
    leftOver !== null
      ? leftOver < 0
        ? `, leaving the client ${formatZAR(Math.abs(leftOver))} short every month.`
        : `, leaving ${formatZAR(leftOver)} each month after living costs and repayments.`
      : ".",
    missed > 0 ? ` ${missed} payment${missed === 1 ? " has" : "s have"} been missed.` : " No payments have been missed.",
    ` FinAware's debt review screen: ${facts.debtReview.headline.toLowerCase()}.`
  ]
    .join(" ")
    .replace(/\s+([,.])/g, "$1")
    .replace(/\s{2,}/g, " ");

  const sections: CaseSummary["sections"] = [
    {
      title: "Income and costs",
      rows: [
        { label: "Take-home income", value: formatZAR(facts.monthlyIncome) },
        { label: "Living costs (excluding debt)", value: facts.monthlyExpenses !== null ? formatZAR(facts.monthlyExpenses) : "Not entered" },
        { label: "Debt repayments", value: formatZAR(totalMonthly) },
        {
          label: leftOver !== null && leftOver < 0 ? "Short each month" : "Left each month",
          value: leftOver !== null ? formatZAR(Math.abs(leftOver)) : "Not known"
        },
        { label: "Savings", value: facts.savings !== null ? formatZAR(facts.savings) : "Not entered" }
      ]
    },
    {
      title: "Credit position",
      rows: [
        { label: "Total owed", value: formatZAR(totalBalance) },
        { label: "Credit score (calculated by FinAware, not a bureau score)", value: String(facts.creditScore) },
        { label: "Missed payments on record", value: String(missed) },
        { label: "Legal records", value: facts.legalRecordTypes.length > 0 ? [...new Set(facts.legalRecordTypes)].join(", ") : "None" }
      ]
    },
    {
      title: "FinAware's assessments",
      rows: [
        { label: "Debt review screen", value: facts.debtReview.headline },
        {
          label: "Risk assessment",
          value: facts.risk
            ? `${facts.risk.level} (${Math.round(facts.risk.score)}/100), ${new Date(facts.risk.assessedAt).toLocaleDateString("en-ZA", { dateStyle: "medium" })}`
            : "Not run"
        },
        ...(facts.risk && facts.risk.drivers.length > 0 ? [{ label: "Main factors", value: facts.risk.drivers.join(", ") }] : [])
      ]
    },
    ...(facts.request?.message
      ? [
          {
            title: "In the client's words",
            rows: [
              ...(facts.request.assistanceType ? [{ label: "Asked for", value: facts.request.assistanceType.replace(/_/g, " ").toLowerCase() }] : []),
              { label: "Message", value: facts.request.message }
            ]
          }
        ]
      : [])
  ];

  const debts = outstanding.map((debt) => ({
    creditor: debt.creditorName,
    type: debt.debtTypeStored,
    balance: formatZAR(debt.balance),
    rate: `${debt.interestRate.toFixed(2)}%`,
    monthly: formatZAR(debt.monthlyObligation),
    status: debt.status.charAt(0) + debt.status.slice(1).toLowerCase(),
    record: debt.totalPaymentsCount > 0 ? `${debt.missedPaymentsCount} missed of ${debt.totalPaymentsCount}` : "No history"
  }));

  const urgent = urgentMatters(facts, missed);

  const prepared = facts.preparedAt.toLocaleDateString("en-ZA", { dateStyle: "long" });
  const plainText = [
    `CASE SUMMARY — ${facts.firstName}`,
    `Prepared with FinAware on ${prepared}. Figures are as recorded in the app; please confirm against statements.`,
    "",
    narrative,
    ...(urgent.length > 0 ? ["", "NEEDS ATTENTION FIRST", ...urgent.map((line) => `- ${line}`)] : []),
    ...sections.flatMap((section) => ["", section.title.toUpperCase(), ...section.rows.map((row) => `${row.label}: ${row.value}`)]),
    "",
    "ACCOUNTS",
    ...debts.map((d) => `${d.creditor} (${d.type}): ${d.balance} at ${d.rate}, ${d.monthly} a month, ${d.status}, ${d.record}`)
  ].join("\n");

  return {
    narrative,
    narrativeSource: "calculated",
    urgent,
    sections,
    debts,
    totals: { balance: totalBalance, monthly: totalMonthly, missed },
    plainText,
    figures: randAmounts(plainText)
  };
}

/** Ask the model for a better-written opening paragraph, from the brief's own facts only. */
export async function narrateCaseSummary(summary: CaseSummary, fetchImpl?: typeof fetch): Promise<CaseSummary> {
  const result = await askModel({
    task: "case-summary",
    system:
      "You write the opening paragraph of a case brief for a South African debt counsellor or financial advisor. Use only the facts given. Do not add any number that is not in them. Four sentences at most, plain and factual, third person, no advice.",
    user: summary.plainText,
    schema: {
      name: "case_summary",
      schema: { type: "object", additionalProperties: false, properties: { paragraph: { type: "string" } }, required: ["paragraph"] }
    },
    validate: (value) => {
      const paragraph = (value as { paragraph?: unknown }).paragraph;
      // The guardrail: any money in the paragraph must be money already in the brief.
      return typeof paragraph === "string" && paragraph.trim().length > 40 && figuresAllowed(paragraph, summary.figures)
        ? paragraph.trim()
        : null;
    },
    timeoutMs: 12_000,
    fetchImpl
  });
  if (!result.ok) return summary;
  return {
    ...summary,
    narrative: result.value,
    narrativeSource: "model",
    plainText: summary.plainText.replace(summary.narrative, result.value)
  };
}
