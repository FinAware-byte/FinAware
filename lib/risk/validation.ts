import { z } from "zod";

// Why: z.coerce.number() turns "" into 0, which would let a blank field pass silently. Blank = required error.
function amount(label: string, rules: (base: z.ZodNumber) => z.ZodNumber) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : typeof value === "string" ? Number(value.replace(/R/gi, "").replace(/,/g, "").trim()) : value),
    rules(z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` }))
  );
}

// The range the risk model was trained on. Scores on record may sit outside it (a bureau scale can
// run to 900), so the value is clamped for the model rather than rejected.
export const CREDIT_SCORE_MIN = 300;
export const CREDIT_SCORE_MAX = 850;

export function clampCreditScore(score: number | null | undefined): number {
  // No credit profile means no calculated score. Never invent a model input for a new user.
  if (typeof score !== "number" || Number.isNaN(score) || score <= 0) return 0;
  return Math.min(CREDIT_SCORE_MAX, Math.max(CREDIT_SCORE_MIN, Math.round(score)));
}

// Why: the Financial API Service is the authoritative validator (activity diagram "Validate financial
// information"); the same schema is reused by the form for instant feedback.
//
// Credit score is deliberately absent. It is issued against the user's accounts and held in
// Credit_Profile, so it is read there when the profile is saved — never accepted from the request.
// Leaving it in this schema let the browser post any number it liked straight into the figure the
// risk model scores on, while the dashboard went on showing the real one.
export const financialProfileSchema = z.object({
  monthlyIncome: amount("Monthly income", (n) =>
    n.positive("Monthly income must be greater than R0").max(100_000_000, "Monthly income looks too large")
  ),
  monthlyExpenses: amount("Monthly expenses", (n) =>
    n.min(0, "Monthly expenses cannot be negative").max(100_000_000, "Monthly expenses look too large")
  ),
  savings: amount("Savings", (n) => n.min(0, "Savings cannot be negative").max(10_000_000_000, "Savings look too large")),
  financialGoal: z
    .string()
    .trim()
    .max(200, "Financial goal must be 200 characters or fewer")
    // Why: nullish so output of this schema (null goal) re-validates in the Financial Data Service.
    .nullish()
    .transform((value) => (value ? value : null))
});

export type FinancialProfileInput = z.infer<typeof financialProfileSchema>;

// Overrides for the "what if?" simulator. Every field is optional — whatever the user has not
// moved keeps its stored value — but the bounds match the model's own input contract, so a slider
// can never send something /predict would reject. Income is not simulatable on purpose: the
// point of the tool is choices the user controls.
export const simulationOverridesSchema = z
  .object({
    monthly_expenses_zar: amount("Monthly expenses", (n) =>
      n.min(0, "Monthly expenses cannot be negative").max(100_000_000, "Monthly expenses look too large")
    ).optional(),
    savings_zar: amount("Savings", (n) =>
      n.min(0, "Savings cannot be negative").max(10_000_000_000, "Savings look too large")
    ).optional(),
    monthly_emi_zar: amount("Monthly loan repayment", (n) =>
      n.min(0, "Monthly repayment cannot be negative").max(100_000_000, "Monthly repayment looks too large")
    ).optional()
    // Credit score is not a lever. It is an outcome of the accounts, so simulating a different
    // one answers nothing useful — the levers that move it are the three above. .strict() means
    // a request that sends one is now rejected rather than quietly honoured.
  })
  .strict();

export type SimulationOverrides = z.infer<typeof simulationOverridesSchema>;

// Essential monthly expenses for the money plan. The category list is closed so a typo cannot
// create a silent new bucket that the plan then treats as essential spending.
export const essentialCategories = [
  "housing",
  "groceries",
  "transport",
  "utilities",
  "healthcare",
  "insurance",
  "education",
  "childcare",
  "other"
] as const;

export const budgetSchema = z.object({
  essentials: z
    .array(
      z.object({
        category: z.enum(essentialCategories, {
          errorMap: () => ({ message: "Choose one of the listed expense categories" })
        }),
        amount: amount("Amount", (n) =>
          n.min(0, "An expense cannot be negative").max(10_000_000, "That amount looks too large")
        )
      })
    )
    .max(essentialCategories.length, "Each category can only appear once")
    .refine(
      (items) => new Set(items.map((item) => item.category)).size === items.length,
      "Each category can only appear once"
    )
});

export type BudgetInput = z.infer<typeof budgetSchema>;

// Live preview of the money plan. Same essentials, plus an optional income to try — the trial
// income is never stored, because a user asking "what if I earned more?" has not had a raise.
export const budgetPreviewSchema = budgetSchema.extend({
  monthlyIncome: amount("Monthly income", (n) =>
    n.positive("Monthly income must be greater than R0").max(100_000_000, "Monthly income looks too large")
  ).optional()
});

export type BudgetPreviewInput = z.infer<typeof budgetPreviewSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}
