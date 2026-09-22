import type { RecommendationPriority, RiskIndicators, RiskLevel } from "../../../lib/risk/types";

// Recommendation rules as versioned DATA (spec §30–33, §47). The engine in recommendations.ts evaluates them.
// Change a rule → bump RULES_VERSION so every stored Recommendation shows which rule set produced it.
export const RULES_VERSION = "1.0";

export const PRIORITY_RANK: Record<RecommendationPriority, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

type IndicatorKey = keyof RiskIndicators | "creditScore";

type Condition = { indicator: IndicatorKey; op: "<" | "<=" | ">" | ">="; value: number };

export type Rule = {
  id: string;
  kind: "tier" | "driver" | "condition";
  // Recommendations with the same topic are merged; the highest priority wins.
  topic: string;
  tiers?: RiskLevel[];
  // Driver rules fire when one of these features is a top driver that INCREASES risk with at least Moderate influence.
  drivers?: string[];
  when?: Condition;
  priority: RecommendationPriority;
  title: string;
  description: string;
  // {label}, {influence}, {value}, {tier} are filled in by the engine.
  reason: string;
};

export const RULES: Rule[] = [
  // ---- Condition rules: the user's own figures (spec §32–33) ----
  {
    id: "COND_NEGATIVE_SURPLUS",
    kind: "condition",
    topic: "cash_flow",
    when: { indicator: "monthlySurplusAfterEmi", op: "<", value: 0 },
    priority: "Critical",
    title: "Stabilise your monthly cash flow",
    description:
      "Review monthly expenses and loan repayment commitments to improve available cash flow. Prioritise essential obligations first.",
    reason: "Your expenses plus loan repayments are {value} more than your monthly income."
  },
  {
    id: "COND_HIGH_REPAYMENT_BURDEN",
    kind: "condition",
    topic: "debt",
    when: { indicator: "debtToIncomeRatio", op: ">", value: 0.4 },
    priority: "High",
    title: "Review your debt obligations",
    description: "Review outstanding debt obligations and repayment commitments, and avoid taking on new credit for now.",
    reason: "Your loan repayments use {value} of your monthly income."
  },
  {
    id: "COND_LOW_SAVINGS_COVERAGE",
    kind: "condition",
    topic: "savings",
    when: { indicator: "savingsCoverageMonths", op: "<", value: 3 },
    priority: "High",
    title: "Build an emergency savings buffer",
    description: "Consider gradually increasing your emergency savings, starting with a manageable fixed amount each month.",
    reason: "Your savings cover {value} of expenses; a common guide is 3 to 6 months."
  },
  {
    id: "COND_LOW_CREDIT_SCORE",
    kind: "condition",
    topic: "credit",
    when: { indicator: "creditScore", op: "<", value: 580 },
    priority: "Medium",
    title: "Monitor your credit behaviour",
    description: "Monitor credit behaviour and maintain responsible credit usage, such as paying accounts on time.",
    reason: "Your credit score of {value} is below 580."
  },
  // ---- Driver rules: what the model relied on for this user (spec §32) ----
  {
    id: "DRV_DEBT",
    kind: "driver",
    topic: "debt",
    drivers: ["debt_to_income_ratio", "monthly_emi_zar", "loan_amount_zar", "loan_to_income_ratio", "has_loan"],
    priority: "Medium",
    title: "Review your debt obligations",
    description: "Review outstanding debt obligations and repayment commitments.",
    reason: "{label} is a {influence} factor influencing this prediction."
  },
  {
    id: "DRV_EXPENSES",
    kind: "driver",
    topic: "expenses",
    drivers: ["expense_to_income_ratio", "monthly_expenses_zar", "disposable_income_zar"],
    priority: "Medium",
    title: "Review your monthly expenses",
    description:
      "Review recurring and discretionary expenses to identify opportunities to reduce monthly financial pressure.",
    reason: "{label} is a {influence} factor influencing this prediction."
  },
  {
    id: "DRV_SAVINGS",
    kind: "driver",
    topic: "savings",
    drivers: ["savings_zar", "savings_coverage_months", "savings_to_income_ratio"],
    priority: "Medium",
    title: "Strengthen your savings",
    description: "Consider gradually increasing your emergency savings buffer.",
    reason: "{label} is a {influence} factor influencing this prediction."
  },
  {
    id: "DRV_CREDIT",
    kind: "driver",
    topic: "credit",
    drivers: ["credit_score"],
    priority: "Medium",
    title: "Monitor your credit behaviour",
    description: "Monitor credit behaviour and maintain responsible credit usage.",
    reason: "{label} is a {influence} factor influencing this prediction."
  },
  {
    id: "DRV_SURPLUS",
    kind: "driver",
    topic: "cash_flow",
    drivers: ["monthly_surplus_after_emi_zar"],
    priority: "Medium",
    title: "Improve your monthly cash flow",
    description: "Review monthly expenses and loan repayment commitments to improve available cash flow.",
    reason: "{label} is a {influence} factor influencing this prediction."
  },
  // ---- Tier rules (spec §31) ----
  {
    id: "TIER_HIGH_AFFORDABILITY",
    kind: "tier",
    topic: "affordability",
    tiers: ["High"],
    priority: "High",
    title: "Review the affordability of your commitments",
    description:
      "List every monthly commitment, prioritise essential obligations and pause unnecessary spending until your position stabilises.",
    reason: "Your profile is classified as {tier} financial risk."
  },
  {
    id: "TIER_HIGH_GUIDANCE",
    kind: "tier",
    topic: "guidance",
    tiers: ["High"],
    priority: "High",
    title: "Consider professional financial guidance",
    description: "A registered debt counsellor or financial advisor can help you plan next steps. See the Get Help page.",
    reason: "Your profile is classified as {tier} financial risk."
  },
  {
    id: "TIER_MEDIUM_RESILIENCE",
    kind: "tier",
    topic: "resilience",
    tiers: ["Medium"],
    priority: "Medium",
    title: "Strengthen your financial resilience",
    description:
      "Reduce unnecessary financial commitments, increase savings where possible and aim to grow your monthly surplus.",
    reason: "Your profile is classified as {tier} financial risk."
  },
  {
    id: "TIER_LOW_MAINTAIN",
    kind: "tier",
    topic: "maintain",
    tiers: ["Low"],
    priority: "Low",
    title: "Maintain healthy financial habits",
    description:
      "Keep building savings, monitor monthly expenses, keep debt at responsible levels and continue long-term planning.",
    reason: "Your profile is classified as {tier} financial risk."
  }
];

export const MAX_RECOMMENDATIONS = 5;
