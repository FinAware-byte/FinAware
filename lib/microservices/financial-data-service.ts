import { prisma } from "@/lib/db/prisma";
import { toDebtStatus } from "@/lib/domain";
import { monthlyPaymentFor } from "@/lib/finance/repayment";
import { clampCreditScore, type FinancialProfileInput } from "@/lib/risk/validation";
import type { EssentialCategory, EssentialItem } from "@/lib/budget/plan";
import type {
  FinancialProfile,
  FinancialProfileView,
  GeneratedRecommendation,
  MlFeaturePayload,
  MlPrediction,
  RiskAssessmentRecord,
  RiskAssessmentSummary,
  RiskLevel,
  StoredRecommendation
} from "@/lib/risk/types";

// Financial Data Service: the only component of the ML feature that touches the database (sequence diagram).
// Existing tables (Users, Debts, Credit_Profile) are READ ONLY here.

function parseUserId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type ProfileRow = {
  profile_id: string;
  user_id: number;
  monthly_income: number;
  monthly_expenses: number;
  savings: number;
  credit_score: number;
  financial_goal: string | null;
  updated_at: Date;
};

function toProfile(row: ProfileRow): FinancialProfile {
  return {
    profileId: row.profile_id,
    userId: row.user_id,
    monthlyIncome: row.monthly_income,
    monthlyExpenses: row.monthly_expenses,
    savings: row.savings,
    creditScore: row.credit_score,
    financialGoal: row.financial_goal,
    updatedAt: row.updated_at.toISOString()
  };
}

export async function getFinancialProfileView(userId: string): Promise<FinancialProfileView | null> {
  const id = parseUserId(userId);
  if (!id) return null;

  const user = await prisma.users.findUnique({
    where: { user_id: id },
    include: { credit_profile: true, financial_profile: true, budget_items: { orderBy: { category: "asc" } }, debts: { orderBy: { created_at: "desc" } } }
  });
  if (!user) return null;

  return {
    profile: user.financial_profile ? toProfile(user.financial_profile) : null,
    defaults: {
      monthlyIncome: user.monthly_income,
      // A calculated credit score is meaningful only once the user has recorded debt/account
      // information. A shell profile must not display a fabricated score.
      creditScore: user.debts.length > 0 ? clampCreditScore(user.credit_profile?.credit_score) : 0
    },
    essentials: user.budget_items.map((item) => ({
      category: item.category as EssentialCategory,
      amount: item.amount
    })) as EssentialItem[],
    debts: user.debts.map((debt) => ({
      creditorName: debt.creditor_name,
      debtType: debt.debt_type,
      balance: debt.balance,
      interestRate: debt.interest_rate,
      // Why: seeded rows use "Active" while app-created rows use "ACTIVE"; normalise like the existing UI does.
      status: toDebtStatus(debt.status)
    })),
    monthlyObligations: activeMonthlyRepayment(user.debts)
  };
}

export async function upsertFinancialProfile(userId: string, input: FinancialProfileInput): Promise<FinancialProfile | null> {
  const id = parseUserId(userId);
  if (!id) return null;
  const user = await prisma.users.findUnique({
    where: { user_id: id },
    select: {
      user_id: true,
      credit_profile: { select: { credit_score: true } },
      debts: { select: { debt_id: true } }
    }
  });
  if (!user) return null;

  const data = {
    monthly_income: input.monthlyIncome,
    monthly_expenses: input.monthlyExpenses,
    savings: input.savings,
    // Read from Credit_Profile, not from the request. The score is a consequence of how the
    // accounts are running, so the one the model scores on is the one the dashboard displays.
    credit_score: user.debts.length > 0 ? clampCreditScore(user.credit_profile?.credit_score) : 0,
    financial_goal: input.financialGoal
  };
  const row = await prisma.financialProfile.upsert({
    where: { user_id: id },
    create: { user_id: id, ...data },
    update: data
  });
  return toProfile(row);
}

const EMPLOYMENT_TO_DATASET: Record<string, string> = {
  EMPLOYED: "Employed",
  SELF_EMPLOYED: "Self-employed",
  STUDENT: "Student",
  UNEMPLOYED: "Unemployed"
};

// Why: Debts has no repayment column. The dashboard's "Monthly Obligations" and this share one
// calculation (lib/finance/repayment), so the model and the interface never disagree. The stored
// Credit_Profile.monthly_obligations can be stale, which is why it is recomputed here.
function activeMonthlyRepayment(
  debts: Array<{ balance: number; interest_rate: number; status: string; debt_type: string }>
): number {
  const total = debts
    .filter((debt) => toDebtStatus(debt.status) === "ACTIVE")
    .reduce(
      (sum, debt) =>
        sum + monthlyPaymentFor({ balance: debt.balance, interestRate: debt.interest_rate, debtType: debt.debt_type }),
      0
    );
  return Number(total.toFixed(2));
}

// Why: stored values vary in casing ("Self-Employed", "SELF_EMPLOYED"). Only the casing is normalised —
// unrecognised values (e.g. "Pensioner") pass through unchanged so the ML service flags UNKNOWN_CATEGORY
// instead of the value being silently replaced.
function toDatasetEmployment(value: string): string {
  const key = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return EMPLOYMENT_TO_DATASET[key] ?? value;
}

// "Retrieve FinancialProfile and Debt data" — returns the model inputs, mapped as documented in
// docs/ml/feature_mapping.md. Returns null profile when the user has not created one yet.
export async function getFinancialData(
  userId: string
): Promise<{ profile: FinancialProfile | null; features: MlFeaturePayload | null } | null> {
  const id = parseUserId(userId);
  if (!id) return null;

  const user = await prisma.users.findUnique({
    where: { user_id: id },
    include: { financial_profile: true, debts: true, credit_profile: true }
  });
  if (!user) return null;
  if (!user.financial_profile) return { profile: null, features: null };

  const profile = user.financial_profile;
  // Why: status casing differs between seeded ("Active") and app-created ("ACTIVE") debts.
  const activeDebts = user.debts.filter((debt) => toDebtStatus(debt.status) === "ACTIVE");
  const totalBalance = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const weightedRate =
    totalBalance > 0
      ? activeDebts.reduce((sum, debt) => sum + debt.balance * debt.interest_rate, 0) / totalBalance
      : 0;
  const hasLoan = activeDebts.length > 0 && totalBalance > 0;

  return {
    profile: toProfile(profile),
    features: {
      monthly_income_zar: profile.monthly_income,
      monthly_expenses_zar: profile.monthly_expenses,
      savings_zar: profile.savings,
      // Read live from Credit_Profile, not from the profile row. The profile stores a snapshot
      // taken when it was last saved; a debt added since then would have moved the calculated
      // score, and the model must score on the current one.
      credit_score: clampCreditScore(user.credit_profile?.credit_score),
      has_loan: hasLoan ? "Yes" : "No",
      loan_amount_zar: hasLoan ? Number(totalBalance.toFixed(2)) : 0,
      // Decision D-4: the same per-debt repayment estimate the dashboard shows ("Monthly Obligations").
      monthly_emi_zar: hasLoan ? activeMonthlyRepayment(activeDebts) : 0,
      loan_interest_rate_pct: Number(weightedRate.toFixed(2)),
      age: user.real_age,
      employment_status: toDatasetEmployment(user.employment_status)
    }
  };
}

export async function createRiskAssessment(
  userId: string,
  input: { prediction: MlPrediction; features: MlFeaturePayload }
): Promise<{ assessmentId: string } | null> {
  const id = parseUserId(userId);
  if (!id) return null;
  const profile = await prisma.financialProfile.findUnique({ where: { user_id: id } });
  if (!profile) return null;

  const { prediction, features } = input;
  const created = await prisma.riskAssessment.create({
    data: {
      profile_id: profile.profile_id,
      risk_level: prediction.riskLevel,
      risk_score: prediction.riskScore,
      low_probability: prediction.probabilities.Low,
      medium_probability: prediction.probabilities.Medium,
      high_probability: prediction.probabilities.High,
      model_name: prediction.model.name,
      model_version: prediction.model.version,
      target_version: prediction.targetVersion,
      target_status: prediction.targetStatus,
      explanation_method: prediction.explanationMethod,
      input_snapshot_json: JSON.stringify(features),
      indicators_json: JSON.stringify(prediction.indicators),
      warnings_json: JSON.stringify(prediction.warnings ?? []),
      drivers: {
        create: prediction.topDrivers.map((driver, index) => ({
          rank: index + 1,
          feature_name: driver.feature,
          display_name: driver.label,
          importance: driver.importance,
          influence: driver.influence,
          direction: driver.direction,
          feature_value: String(driver.value)
        }))
      }
    }
  });
  return { assessmentId: created.assessment_id };
}

export async function createRecommendations(
  assessmentId: string,
  recommendations: GeneratedRecommendation[]
): Promise<number | null> {
  const assessment = await prisma.riskAssessment.findUnique({ where: { assessment_id: assessmentId } });
  if (!assessment) return null;

  await prisma.recommendation.createMany({
    data: recommendations.map((item) => ({
      assessment_id: assessmentId,
      recommendation_type: item.type,
      title: item.title,
      recommendation_text: item.description,
      reason: item.reason,
      priority: item.priority,
      priority_rank: item.priorityRank,
      rule_id: item.ruleId,
      trace_json: JSON.stringify(item.trace),
      rules_version: item.rulesVersion
    }))
  });
  return recommendations.length;
}

function parseNumericValue(value: string): number | string {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed : value;
}

// A snapshot that fails to parse costs the explanation its arithmetic, not the whole assessment.
function parseSnapshot(json: string): MlFeaturePayload | null {
  try {
    const value = JSON.parse(json) as MlFeaturePayload;
    return value && typeof value.monthly_income_zar === "number" ? value : null;
  } catch {
    return null;
  }
}

async function loadAssessment(where: { assessment_id: string } | { profile_id: string }): Promise<RiskAssessmentRecord | null> {
  const row = await prisma.riskAssessment.findFirst({
    where,
    orderBy: { prediction_date: "desc" },
    include: {
      drivers: { orderBy: { rank: "asc" } },
      recommendations: { orderBy: [{ priority_rank: "asc" }, { created_date: "asc" }] }
    }
  });
  if (!row) return null;

  return {
    assessmentId: row.assessment_id,
    riskLevel: row.risk_level as RiskLevel,
    riskScore: row.risk_score,
    probabilities: { Low: row.low_probability, Medium: row.medium_probability, High: row.high_probability },
    predictionDate: row.prediction_date.toISOString(),
    modelName: row.model_name,
    modelVersion: row.model_version,
    targetVersion: row.target_version,
    targetStatus: row.target_status,
    explanationMethod: row.explanation_method,
    indicators: JSON.parse(row.indicators_json) as RiskAssessmentRecord["indicators"],
    inputs: parseSnapshot(row.input_snapshot_json),
    warnings: JSON.parse(row.warnings_json) as RiskAssessmentRecord["warnings"],
    drivers: row.drivers.map((driver) => ({
      feature: driver.feature_name,
      label: driver.display_name,
      importance: driver.importance,
      influence: driver.influence as RiskAssessmentRecord["drivers"][number]["influence"],
      direction: driver.direction as RiskAssessmentRecord["drivers"][number]["direction"],
      value: parseNumericValue(driver.feature_value)
    })),
    recommendations: row.recommendations.map(
      (item): StoredRecommendation => ({
        recommendationId: item.recommendation_id,
        type: item.recommendation_type,
        title: item.title,
        description: item.recommendation_text,
        reason: item.reason,
        priority: item.priority as StoredRecommendation["priority"],
        rulesVersion: item.rules_version,
        trace: JSON.parse(item.trace_json) as StoredRecommendation["trace"]
      })
    )
  };
}

export async function getAssessment(assessmentId: string): Promise<RiskAssessmentRecord | null> {
  return loadAssessment({ assessment_id: assessmentId });
}

export async function getLatestAssessment(userId: string): Promise<RiskAssessmentRecord | null> {
  const id = parseUserId(userId);
  if (!id) return null;
  const profile = await prisma.financialProfile.findUnique({ where: { user_id: id } });
  if (!profile) return null;
  return loadAssessment({ profile_id: profile.profile_id });
}

export async function listAssessmentHistory(userId: string, limit = 20): Promise<RiskAssessmentSummary[]> {
  const id = parseUserId(userId);
  if (!id) return [];
  const profile = await prisma.financialProfile.findUnique({ where: { user_id: id } });
  if (!profile) return [];

  const rows = await prisma.riskAssessment.findMany({
    where: { profile_id: profile.profile_id },
    orderBy: { prediction_date: "desc" },
    take: limit,
    select: { assessment_id: true, risk_level: true, risk_score: true, prediction_date: true, model_version: true }
  });
  return rows.map((row) => ({
    assessmentId: row.assessment_id,
    riskLevel: row.risk_level as RiskLevel,
    riskScore: row.risk_score,
    predictionDate: row.prediction_date.toISOString(),
    modelVersion: row.model_version
  }));
}
