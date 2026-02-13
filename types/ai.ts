export type AiRecommendationsResponse = {
  summary: string;
  top_actions: string[];
  risk_factors: string[];
  monthly_plan: {
    week1: string[];
    week2: string[];
    week3: string[];
    week4: string[];
  };
  warnings: string[];
};
