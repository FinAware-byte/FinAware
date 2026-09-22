// Shared contracts for the ML Financial Risk Assessment feature (UML: Assess Financial Risk).

export type RiskLevel = "Low" | "Medium" | "High";
export const riskLevels: RiskLevel[] = ["Low", "Medium", "High"];

export type Influence = "Significant" | "Moderate" | "Minor";
export type Direction = "increases_risk" | "decreases_risk";

export type RiskDriver = {
  feature: string;
  label: string;
  importance: number;
  influence: Influence;
  direction: Direction;
  value: number | string;
};

export type RiskIndicators = {
  debtToIncomeRatio: number;
  expenseToIncomeRatio: number;
  savingsToIncomeRatio: number;
  savingsCoverageMonths: number;
  disposableIncome: number;
  monthlySurplusAfterEmi: number;
  loanToIncomeRatio: number;
};

// Input sent to the ML Prediction Service (dataset field names; see docs/ml/feature_mapping.md).
export type MlFeaturePayload = {
  monthly_income_zar: number;
  monthly_expenses_zar: number;
  savings_zar: number;
  credit_score: number;
  has_loan: "Yes" | "No";
  loan_amount_zar: number;
  monthly_emi_zar: number;
  loan_interest_rate_pct: number;
  age: number;
  employment_status: string;
};

export type PredictionWarning = { code: string; field: string; message: string };

export type MlPrediction = {
  riskLevel: RiskLevel;
  riskScore: number;
  predictedProbability: number;
  probabilities: Record<RiskLevel, number>;
  topDrivers: RiskDriver[];
  explanationMethod: string;
  indicators: RiskIndicators;
  model: { name: string; version: string };
  targetVersion: string;
  targetStatus: string;
  warnings: PredictionWarning[];
};

export type RecommendationPriority = "Critical" | "High" | "Medium" | "Low";

export type RecommendationTrace = {
  ruleId: string;
  tier: RiskLevel;
  driver: string | null;
  indicator: string | null;
  userValue: number | string | null;
};

export type GeneratedRecommendation = {
  type: string;
  title: string;
  description: string;
  reason: string;
  priority: RecommendationPriority;
  priorityRank: number;
  ruleId: string;
  trace: RecommendationTrace[];
  rulesVersion: string;
};

export type FinancialProfile = {
  profileId: string;
  userId: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  savings: number;
  creditScore: number;
  financialGoal: string | null;
  updatedAt: string;
};

export type FinancialProfileView = {
  profile: FinancialProfile | null;
  // Values from the existing records used to prefill a new profile (read-only source).
  defaults: { monthlyIncome: number; creditScore: number };
  debts: Array<{ creditorName: string; debtType: string; balance: number; interestRate: number; status: string }>;
  monthlyObligations: number;
};

export type StoredRecommendation = {
  recommendationId: string;
  type: string;
  title: string;
  description: string;
  reason: string;
  priority: RecommendationPriority;
  rulesVersion: string;
  trace: RecommendationTrace[];
};

export type RiskAssessmentRecord = {
  assessmentId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  probabilities: Record<RiskLevel, number>;
  predictionDate: string;
  modelName: string;
  modelVersion: string;
  targetVersion: string;
  targetStatus: string;
  explanationMethod: string;
  indicators: RiskIndicators;
  warnings: PredictionWarning[];
  drivers: RiskDriver[];
  recommendations: StoredRecommendation[];
};

export type RiskAssessmentSummary = {
  assessmentId: string;
  riskLevel: RiskLevel;
  riskScore: number;
  predictionDate: string;
  modelVersion: string;
};

export type ApiError = {
  error: string;
  message: string;
  fieldErrors?: Record<string, string>;
};
