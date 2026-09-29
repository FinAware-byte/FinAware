import { formatZAR } from "@/lib/format";
import { formatDriverValue } from "@/lib/risk/format";
import { RULES, RULES_VERSION, type Rule } from "@/lib/risk/recommendation-rules";
import type {
  Direction,
  Influence,
  MlFeaturePayload,
  RecommendationTrace,
  RiskAssessmentRecord,
  RiskIndicators,
  StoredRecommendation
} from "@/lib/risk/types";
import type { WorkingGroup } from "@/types/working";

// "Why this recommendation?" — the answer to that question, built from what was stored with the
// assessment and nothing else.
//
// Three parts, each checkable:
//   1. The rule that fired, read from the same rule table the engine evaluates, with the user's
//      value set against its threshold.
//   2. The arithmetic behind that value, from the exact inputs the model scored (the stored
//      snapshot), so "58% of income" is shown as the two rand figures it came from.
//   3. The SHAP drivers for this prediction, with the ones this recommendation rests on marked.
//
// Nothing is re-predicted and nothing is estimated. If the snapshot is missing the arithmetic is
// left out rather than rebuilt from today's figures, which would explain a different prediction.

export type WhyTrigger = {
  kind: Rule["kind"];
  ruleId: string;
  text: string;
  /** For driver rules: every factor the rule watches, so "one of these" is not left vague. */
  watches?: string[];
};

export type WhyDriver = {
  feature: string;
  label: string;
  /** Share of the model's reasoning for this user, 0–1. */
  share: number;
  direction: Direction;
  influence: Influence;
  value: string;
  /** True when this recommendation rests on this driver. */
  linked: boolean;
};

export type RecommendationWhy = {
  triggers: WhyTrigger[];
  working: WorkingGroup[];
  drivers: WhyDriver[];
  /** Share of the model's reasoning that sits outside the drivers listed. */
  otherShare: number;
  /** True for recommendations that follow from the overall result rather than one factor. */
  followsFromTier: boolean;
  rulesVersion: string;
  /** The recommendation was produced by a different rule set from the one explaining it. */
  staleRules: boolean;
};

type ExplainableAssessment = Pick<RiskAssessmentRecord, "riskLevel" | "riskScore" | "probabilities" | "drivers" | "inputs">;

// Trace indicators are stored camelCase for condition rules and as the model's feature name for
// driver rules. Both are brought to the feature name so they can be matched against drivers.
const INDICATOR_FEATURE: Record<keyof RiskIndicators | "creditScore", string> = {
  debtToIncomeRatio: "debt_to_income_ratio",
  expenseToIncomeRatio: "expense_to_income_ratio",
  savingsToIncomeRatio: "savings_to_income_ratio",
  savingsCoverageMonths: "savings_coverage_months",
  disposableIncome: "disposable_income_zar",
  monthlySurplusAfterEmi: "monthly_surplus_after_emi_zar",
  loanToIncomeRatio: "loan_to_income_ratio",
  creditScore: "credit_score"
};

function toFeature(key: string | null): string | null {
  if (!key) return null;
  return INDICATOR_FEATURE[key as keyof typeof INDICATOR_FEATURE] ?? key;
}

// Mirrors DISPLAY_NAMES in ml-service/ml/config.py, so a factor is called the same thing here as
// in the drivers list beside it.
const FEATURE_LABELS: Record<string, string> = {
  age: "Age",
  employment_status: "Employment status",
  has_loan: "Having a loan",
  monthly_income_zar: "Monthly income",
  monthly_expenses_zar: "Monthly expenses",
  savings_zar: "Savings",
  credit_score: "Credit score",
  loan_amount_zar: "Total debt balance",
  monthly_emi_zar: "Monthly loan repayment",
  loan_interest_rate_pct: "Loan interest rate",
  debt_to_income_ratio: "Debt-to-income ratio",
  savings_to_income_ratio: "Savings-to-income ratio",
  disposable_income_zar: "Disposable income",
  expense_to_income_ratio: "Expense-to-income ratio",
  monthly_surplus_after_emi_zar: "Monthly surplus after loan repayment",
  savings_coverage_months: "Savings coverage",
  loan_to_income_ratio: "Loan-to-income ratio"
};

// What a condition rule is measuring, as the subject of "Fires when … is more than …".
const CONDITION_SUBJECT: Record<string, string> = {
  debtToIncomeRatio: "the share of your income going to loan repayments",
  expenseToIncomeRatio: "the share of your income going to expenses",
  savingsToIncomeRatio: "your savings against a year's income",
  savingsCoverageMonths: "the number of months your savings would cover expenses",
  disposableIncome: "what is left after expenses",
  monthlySurplusAfterEmi: "what is left after expenses and loan repayments",
  loanToIncomeRatio: "your total debt against a year's income",
  creditScore: "your credit score"
};

const OP_WORDS: Record<NonNullable<Rule["when"]>["op"], string> = {
  "<": "less than",
  "<=": "at most",
  ">": "more than",
  ">=": "at least"
};

const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;

function formatIndicator(key: string, value: number): string {
  switch (key) {
    case "debtToIncomeRatio":
    case "expenseToIncomeRatio":
      return percent(value);
    case "savingsToIncomeRatio":
    case "loanToIncomeRatio":
      return `${value.toFixed(2)}× a year's income`;
    case "savingsCoverageMonths":
      return `${value.toFixed(1)} months`;
    case "disposableIncome":
    case "monthlySurplusAfterEmi":
      return formatZAR(value);
    default:
      return String(Math.round(value));
  }
}

function describeTrigger(trace: RecommendationTrace, assessment: ExplainableAssessment): WhyTrigger {
  const rule = RULES.find((candidate) => candidate.id === trace.ruleId);
  if (!rule) {
    return {
      kind: "condition",
      ruleId: trace.ruleId,
      text: `Produced by rule ${trace.ruleId}, which is no longer in the current rule set.`
    };
  }

  if (rule.kind === "condition" && rule.when) {
    const key = rule.when.indicator;
    const subject = CONDITION_SUBJECT[key] ?? FEATURE_LABELS[toFeature(key) ?? ""] ?? key;
    const yours = typeof trace.userValue === "number" ? ` Yours is ${formatIndicator(key, trace.userValue)}.` : "";
    return {
      kind: "condition",
      ruleId: rule.id,
      text: `Fires when ${subject} is ${OP_WORDS[rule.when.op]} ${formatIndicator(key, rule.when.value)}.${yours}`
    };
  }

  if (rule.kind === "driver") {
    const driver = assessment.drivers.find((candidate) => candidate.feature === trace.driver);
    const watches = (rule.drivers ?? []).map((feature) => FEATURE_LABELS[feature] ?? feature);
    const detail = driver
      ? ` For you, ${driver.label.toLowerCase()} did: ${driver.influence.toLowerCase()} influence, ${percent(driver.importance)} of the model's reasoning.`
      : "";
    return {
      kind: "driver",
      ruleId: rule.id,
      text: `Fires when one of the factors below pushes your risk up with at least moderate influence.${detail}`,
      watches
    };
  }

  const tier = trace.tier;
  return {
    kind: "tier",
    ruleId: rule.id,
    text: `Fires for every ${tier.toLowerCase()}-risk result. The model put ${percent(assessment.probabilities[tier])} on ${tier}, the most likely of the three.`
  };
}

/** The arithmetic behind one figure, from the inputs the model actually scored. */
export function workingFor(feature: string, inputs: MlFeaturePayload): WorkingGroup | null {
  const income = inputs.monthly_income_zar;
  const expenses = inputs.monthly_expenses_zar;
  const repayments = inputs.monthly_emi_zar;
  const savings = inputs.savings_zar;
  const debt = inputs.loan_amount_zar;
  const title = FEATURE_LABELS[feature] ?? feature;
  if (!(income > 0)) return null;

  switch (feature) {
    case "debt_to_income_ratio":
      return {
        title,
        lines: [
          { label: "Monthly loan repayments", value: formatZAR(repayments) },
          { label: "÷ Monthly income", value: formatZAR(income) },
          { label: "= Share of income", value: percent(repayments / income), result: true }
        ]
      };
    case "expense_to_income_ratio":
      return {
        title,
        lines: [
          { label: "Monthly expenses", value: formatZAR(expenses) },
          { label: "÷ Monthly income", value: formatZAR(income) },
          { label: "= Share of income", value: percent(expenses / income), result: true }
        ]
      };
    case "savings_coverage_months":
      return expenses > 0
        ? {
            title,
            lines: [
              { label: "Savings", value: formatZAR(savings) },
              { label: "÷ Monthly expenses", value: formatZAR(expenses) },
              { label: "= Months covered", value: `${(savings / expenses).toFixed(1)} months`, result: true }
            ]
          }
        : { title, lines: [{ label: "Savings", value: formatZAR(savings) }], note: "No expenses were recorded, so coverage is capped rather than infinite." };
    case "savings_to_income_ratio":
      return {
        title,
        lines: [
          { label: "Savings", value: formatZAR(savings) },
          { label: "÷ A year's income (monthly × 12)", value: formatZAR(income * 12) },
          { label: "= Savings against income", value: `${(savings / (income * 12)).toFixed(2)}×`, result: true }
        ],
        note: "The model's training data caps this between 0.1× and 10×."
      };
    case "disposable_income_zar":
      return {
        title,
        lines: [
          { label: "Monthly income", value: formatZAR(income) },
          { label: "− Monthly expenses", value: formatZAR(expenses) },
          { label: "= Left after expenses", value: formatZAR(income - expenses), result: true }
        ]
      };
    case "monthly_surplus_after_emi_zar":
      return {
        title,
        lines: [
          { label: "Monthly income", value: formatZAR(income) },
          { label: "− Monthly expenses", value: formatZAR(expenses) },
          { label: "− Monthly loan repayments", value: formatZAR(repayments) },
          { label: "= Left over each month", value: formatZAR(income - expenses - repayments), result: true }
        ]
      };
    case "loan_to_income_ratio":
      return {
        title,
        lines: [
          { label: "Total debt balance", value: formatZAR(debt) },
          { label: "÷ A year's income (monthly × 12)", value: formatZAR(income * 12) },
          { label: "= Debt against income", value: `${(debt / (income * 12)).toFixed(2)}×`, result: true }
        ]
      };
    case "credit_score":
      return {
        title,
        lines: [{ label: "Credit score", value: String(Math.round(inputs.credit_score)), result: true }],
        note: "Calculated from your payment record, repayments, length of history, account mix and judgments. Score Coach shows the breakdown."
      };
    case "monthly_emi_zar":
      return {
        title,
        lines: [{ label: "Monthly loan repayments", value: formatZAR(repayments), result: true }],
        note: "The sum of the monthly repayments on your active debts."
      };
    case "loan_amount_zar":
      return {
        title,
        lines: [{ label: "Total debt balance", value: formatZAR(debt), result: true }],
        note: "The sum of the balances on your active debts."
      };
    case "loan_interest_rate_pct":
      return {
        title,
        lines: [{ label: "Average interest rate", value: `${inputs.loan_interest_rate_pct.toFixed(2)}%`, result: true }],
        note: "Your debts' interest rates, weighted by balance, so a large balance counts for more."
      };
    case "monthly_income_zar":
    case "monthly_expenses_zar":
    case "savings_zar": {
      const value = feature === "monthly_income_zar" ? income : feature === "monthly_expenses_zar" ? expenses : savings;
      return { title, lines: [{ label: title, value: formatZAR(value), result: true }], note: "As entered on your financial profile." };
    }
    case "age":
      return { title, lines: [{ label: "Age", value: String(inputs.age), result: true }], note: "From your identity details." };
    case "employment_status":
      return {
        title,
        lines: [{ label: "Employment status", value: inputs.employment_status, result: true }],
        note: "From your identity details."
      };
    case "has_loan":
      return {
        title,
        lines: [{ label: "Having a loan", value: inputs.has_loan, result: true }],
        note: "Yes when at least one active debt has a balance."
      };
    default:
      return null;
  }
}

function riskScoreWorking(assessment: ExplainableAssessment): WorkingGroup {
  // Mirrors RISK_SCORE_WEIGHTS in ml-service/ml/predict.py: Low 0, Medium ½, High 1.
  // Two decimals, and the answer is the sum of the lines as printed. Rounding each line more
  // coarsely produced receipts that did not add up ("0% × 1 = 0.1", "4.5 + 0.1 = 4.5").
  const p = assessment.probabilities;
  const pct2 = (value: number) => `${(value * 100).toFixed(2)}%`;
  const medium = Number((p.Medium * 50).toFixed(2));
  const high = Number((p.High * 100).toFixed(2));
  const total = medium + high;
  const shown = Math.round(assessment.riskScore);

  // The model stores the score to one decimal and the card rounds that, so the whole number on
  // the card can differ from rounding this total directly. When it does, say where it came from.
  const note =
    Math.round(total) === shown
      ? total === shown
        ? undefined
        : `Shown rounded as ${shown} on the result above.`
      : `The model stores this to one decimal (${assessment.riskScore.toFixed(1)}), which is shown rounded as ${shown} on the result above.`;

  return {
    title: "Risk score",
    lines: [
      { label: `Low ${pct2(p.Low)} × 0`, value: "0.00" },
      { label: `Medium ${pct2(p.Medium)} × ½`, value: medium.toFixed(2) },
      { label: `High ${pct2(p.High)} × 1`, value: high.toFixed(2) },
      { label: "= Risk score out of 100", value: total.toFixed(2), result: true }
    ],
    note
  };
}

export function explainRecommendation(rec: StoredRecommendation, assessment: ExplainableAssessment): RecommendationWhy {
  // A merged recommendation carries one trace per rule that fired; each is explained once.
  const seen = new Set<string>();
  const traces = rec.trace.filter((trace) => (seen.has(trace.ruleId) ? false : (seen.add(trace.ruleId), true)));

  const linked = new Set<string>();
  for (const trace of traces) {
    const fromDriver = toFeature(trace.driver);
    const fromIndicator = toFeature(trace.indicator);
    if (fromDriver) linked.add(fromDriver);
    if (fromIndicator) linked.add(fromIndicator);
  }

  const followsFromTier = traces.length > 0 && traces.every((trace) => trace.indicator === null && trace.driver === null);

  const working: WorkingGroup[] = [];
  if (assessment.inputs) {
    for (const feature of linked) {
      const group = workingFor(feature, assessment.inputs);
      if (group) working.push(group);
    }
  }
  if (followsFromTier) working.push(riskScoreWorking(assessment));

  const drivers: WhyDriver[] = assessment.drivers.map((driver) => ({
    feature: driver.feature,
    label: driver.label,
    share: driver.importance,
    direction: driver.direction,
    influence: driver.influence,
    value: formatDriverValue(driver.feature, driver.value),
    linked: linked.has(driver.feature)
  }));
  const listed = drivers.reduce((sum, driver) => sum + driver.share, 0);

  return {
    triggers: traces.map((trace) => describeTrigger(trace, assessment)),
    working,
    drivers,
    otherShare: Math.max(0, 1 - listed),
    followsFromTier,
    rulesVersion: rec.rulesVersion,
    staleRules: rec.rulesVersion !== RULES_VERSION
  };
}
