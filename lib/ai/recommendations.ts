import { z } from "zod";
import type { AiRecommendationsResponse } from "@/types/ai";
import type { AppDebt, AppUser } from "@/lib/domain";

export type RecommendationContext = {
  focus?: string;
  cashflow?: {
    monthlyIncome: number;
    nonDebtExpenses: number;
    debtObligations: number;
    netCashflow: number;
    debtToIncomeRatio: number;
    expenseToIncomeRatio: number;
    projectedScoreDelta30d: number;
    scorePressure: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
  };
};

const aiOutputSchema: z.ZodType<AiRecommendationsResponse> = z.object({
  summary: z.string(),
  top_actions: z.array(z.string()),
  risk_factors: z.array(z.string()),
  monthly_plan: z.object({
    week1: z.array(z.string()),
    week2: z.array(z.string()),
    week3: z.array(z.string()),
    week4: z.array(z.string())
  }),
  warnings: z.array(z.string())
});

function buildPrompt(user: AppUser, debts: AppDebt[], context?: RecommendationContext): string {
  const promptParts = [
    "You are a financial rehabilitation assistant for a demo app called FinAware.",
    "Produce practical and non-absolute advice. Do not guarantee outcomes.",
    "Return strict JSON only matching the requested schema.",
    "Always include a warning that this is demo guidance and not financial advice.",
    "User profile:",
    JSON.stringify(
      {
        fullName: user.fullName,
        employmentStatus: user.employmentStatus,
        monthlyIncome: user.monthlyIncome,
        realAge: user.realAge,
        creditScore: user.creditScore,
        riskStatus: user.riskStatus
      },
      null,
      2
    ),
    "Debt accounts:",
    JSON.stringify(
      debts.map((debt) => ({
        creditorName: debt.creditorName,
        debtType: debt.debtType,
        interestRate: debt.interestRate,
        balance: debt.balance,
        monthlyObligation: debt.monthlyObligation,
        status: debt.status,
        missedPaymentsCount: debt.missedPaymentsCount,
        hasLegalJudgment: debt.hasLegalJudgment
      })),
      null,
      2
    )
  ];

  if (context?.focus) {
    promptParts.push(`Current focus: ${context.focus}`);
  }

  if (context?.cashflow) {
    promptParts.push("Income vs expense snapshot:");
    promptParts.push(JSON.stringify(context.cashflow, null, 2));
    promptParts.push(
      "Use the cashflow snapshot to prioritize actions that improve debt-to-income ratio and score trend."
    );
  }

  return promptParts.join("\n");
}

function fallbackRecommendations(
  user: AppUser,
  debts: AppDebt[],
  context?: RecommendationContext
): AiRecommendationsResponse {
  const hasJudgment = debts.some((debt) => debt.hasLegalJudgment);
  const hasGarnished = debts.some((debt) => debt.status === "GARNISHED");
  const missedTotal = debts.reduce((sum, debt) => sum + debt.missedPaymentsCount, 0);
  const netCashflow = context?.cashflow?.netCashflow ?? null;

  const focus =
    netCashflow !== null && netCashflow < 0
      ? "close your monthly cashflow deficit before taking on any new obligations"
      : user.riskStatus === "HIGH"
      ? "stabilize your cash flow and prevent new missed payments"
      : user.riskStatus === "MEDIUM"
        ? "reduce revolving balances and rebuild payment consistency"
        : "maintain healthy utilization and grow emergency buffers";

  // Why: deterministic fallback keeps recommendation output stable and available when AI access is unavailable.
  return {
    summary: `Your current priority is to ${focus}. Start with one change you can sustain for the next 30 days.`,
    top_actions: [
      "List all debts by interest rate and pay minimums on all accounts first.",
      "Direct any surplus income to the highest-cost debt while avoiding new credit usage.",
      "Set payment reminders 3 days before due dates to reduce missed payments."
    ],
    risk_factors: [
      "Debt utilization pressure",
      missedTotal > 0 ? "Recent missed payments" : "Payment consistency risk",
      hasJudgment ? "Legal judgments on record" : "Limited affordability margin",
      hasGarnished ? "Garnishee order exposure" : "Variable monthly expenses"
    ],
    monthly_plan: {
      week1: ["Build a full debt list", "Set a realistic budget cap", "Automate minimum payments"],
      week2: ["Negotiate 1-2 account terms", "Pause non-essential credit spend"],
      week3: ["Pay extra toward one target debt", "Track weekly cash-flow variance"],
      week4: ["Review progress", "Adjust plan for next month", "Prepare emergency buffer transfer"]
    },
    warnings: [
      "Demo data only. Not financial advice.",
      "Outcomes depend on your actual lender terms, legal obligations, and income stability."
    ]
  };
}

export async function getAiRecommendations(
  user: AppUser,
  debts: AppDebt[],
  context?: RecommendationContext
): Promise<AiRecommendationsResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackRecommendations(user, debts, context);
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content:
              "You are a cautious financial guidance assistant. Use non-absolute language and avoid legal guarantees."
          },
          {
            role: "user",
            content: buildPrompt(user, debts, context)
          }
        ],
        text: {
          format: {
            type: "json_schema",
            name: "finaware_recommendations",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                summary: { type: "string" },
                top_actions: {
                  type: "array",
                  items: { type: "string" }
                },
                risk_factors: {
                  type: "array",
                  items: { type: "string" }
                },
                monthly_plan: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    week1: { type: "array", items: { type: "string" } },
                    week2: { type: "array", items: { type: "string" } },
                    week3: { type: "array", items: { type: "string" } },
                    week4: { type: "array", items: { type: "string" } }
                  },
                  required: ["week1", "week2", "week3", "week4"]
                },
                warnings: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["summary", "top_actions", "risk_factors", "monthly_plan", "warnings"]
            }
          }
        }
      })
    });

    if (!response.ok) {
      return fallbackRecommendations(user, debts, context);
    }

    const data = (await response.json()) as { output_text?: string };
    const parsed = aiOutputSchema.safeParse(JSON.parse(data.output_text ?? "{}"));

    if (!parsed.success) {
      return fallbackRecommendations(user, debts, context);
    }

    const warnings = parsed.data.warnings.some((warning) =>
      warning.toLowerCase().includes("not financial advice")
    )
      ? parsed.data.warnings
      : [...parsed.data.warnings, "Demo data only. Not financial advice."];

    return { ...parsed.data, warnings };
  } catch {
    return fallbackRecommendations(user, debts, context);
  }
}
