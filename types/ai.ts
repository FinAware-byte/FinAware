import type { WorkingLine } from "@/types/working";

export type RecommendationAction = {
  headline: string;
  amount?: string;
  amountLabel?: string;
  detail: string;
  basis: string;
  /** The arithmetic behind the amount, for "Why this?". Optional: older responses lack it. */
  working?: WorkingLine[];
  tone: "urgent" | "opportunity" | "steady";
};

export type AiRecommendationsResponse = {
  /** Where the wording came from. The figures are computed either way. */
  source?: "model" | "calculated";
  /** The single figure worth leading with, and the actions as structured data rather than
   *  sentences — so the interface can set the numbers as numbers. Always calculated, never
   *  written by a model, whatever `source` says about the prose. */
  headline?: { amount: string; label: string; sentence: string } | null;
  actions?: RecommendationAction[];
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
