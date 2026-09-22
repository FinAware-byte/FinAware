import type {
  GeneratedRecommendation,
  MlPrediction,
  RecommendationTrace,
  RiskIndicators
} from "../../../lib/risk/types";
import { MAX_RECOMMENDATIONS, PRIORITY_RANK, RULES, RULES_VERSION, type Rule } from "./recommendation-rules";

// Deterministic, rule-based recommendation engine (spec §30–33). No OpenAI or other LLM.
// Input: risk level + top drivers from the ML Prediction Service + the user's financial values.
// Same input always gives the same output, and every item carries its trace (tier + driver + user value).

type EngineInput = {
  prediction: Pick<MlPrediction, "riskLevel" | "topDrivers" | "indicators">;
  creditScore: number;
};

const formatRand = (value: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(value);

function indicatorValue(key: string, indicators: RiskIndicators, creditScore: number): number {
  return key === "creditScore" ? creditScore : indicators[key as keyof RiskIndicators];
}

function formatIndicator(key: string, value: number): string {
  switch (key) {
    case "monthlySurplusAfterEmi":
      return formatRand(Math.abs(value));
    case "debtToIncomeRatio":
    case "expenseToIncomeRatio":
      return `${Math.round(value * 100)}%`;
    case "savingsCoverageMonths":
      return `${value.toFixed(1)} months`;
    default:
      return String(Math.round(value));
  }
}

function matches(value: number, op: "<" | "<=" | ">" | ">=", threshold: number): boolean {
  if (op === "<") return value < threshold;
  if (op === "<=") return value <= threshold;
  if (op === ">") return value > threshold;
  return value >= threshold;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
}

export function generateRecommendations(input: EngineInput): GeneratedRecommendation[] {
  const { riskLevel, topDrivers, indicators } = input.prediction;
  const riskDrivers = topDrivers.filter((d) => d.direction === "increases_risk" && d.influence !== "Minor");
  const fired: GeneratedRecommendation[] = [];

  const emit = (rule: Rule, reason: string, trace: RecommendationTrace) => {
    fired.push({
      type: rule.topic,
      title: rule.title,
      description: rule.description,
      reason,
      priority: rule.priority,
      priorityRank: PRIORITY_RANK[rule.priority],
      ruleId: rule.id,
      trace: [trace],
      rulesVersion: RULES_VERSION
    });
  };

  for (const rule of RULES) {
    if (rule.kind === "condition" && rule.when) {
      const value = indicatorValue(rule.when.indicator, indicators, input.creditScore);
      if (!matches(value, rule.when.op, rule.when.value)) continue;
      const related = riskDrivers.find((d) => RULES.some((r) => r.kind === "driver" && r.topic === rule.topic && r.drivers?.includes(d.feature)));
      emit(rule, fill(rule.reason, { value: formatIndicator(rule.when.indicator, value) }), {
        ruleId: rule.id,
        tier: riskLevel,
        driver: related?.feature ?? null,
        indicator: rule.when.indicator,
        userValue: value
      });
    } else if (rule.kind === "driver" && rule.drivers) {
      const driver = riskDrivers.find((d) => rule.drivers?.includes(d.feature));
      if (!driver) continue;
      emit(rule, fill(rule.reason, { label: driver.label, influence: driver.influence.toLowerCase() }), {
        ruleId: rule.id,
        tier: riskLevel,
        driver: driver.feature,
        indicator: driver.feature,
        userValue: driver.value
      });
    } else if (rule.kind === "tier" && rule.tiers?.includes(riskLevel)) {
      emit(rule, fill(rule.reason, { tier: riskLevel.toLowerCase() }), {
        ruleId: rule.id,
        tier: riskLevel,
        driver: null,
        indicator: null,
        userValue: null
      });
    }
  }

  // One recommendation per topic: keep the highest-priority wording, merge the traces so nothing is lost.
  const byTopic = new Map<string, GeneratedRecommendation>();
  for (const item of fired) {
    const existing = byTopic.get(item.type);
    if (!existing) {
      byTopic.set(item.type, item);
    } else if (item.priorityRank < existing.priorityRank) {
      byTopic.set(item.type, { ...item, trace: [...item.trace, ...existing.trace] });
    } else {
      existing.trace.push(...item.trace);
    }
  }

  const order = new Map(RULES.map((rule, index) => [rule.id, index]));
  return [...byTopic.values()]
    .sort((a, b) => a.priorityRank - b.priorityRank || (order.get(a.ruleId) ?? 0) - (order.get(b.ruleId) ?? 0))
    .slice(0, MAX_RECOMMENDATIONS);
}
