import { z } from "zod";

// Why: z.coerce.number() turns "" into 0, which would let a blank field pass silently. Blank = required error.
function amount(label: string, rules: (base: z.ZodNumber) => z.ZodNumber) {
  return z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : typeof value === "string" ? Number(value) : value),
    rules(z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` }))
  );
}

// Why: the Financial API Service is the authoritative validator (activity diagram "Validate financial
// information"); the same schema is reused by the form for instant feedback.
export const financialProfileSchema = z.object({
  monthlyIncome: amount("Monthly income", (n) =>
    n.positive("Monthly income must be greater than R0").max(100_000_000, "Monthly income looks too large")
  ),
  monthlyExpenses: amount("Monthly expenses", (n) =>
    n.min(0, "Monthly expenses cannot be negative").max(100_000_000, "Monthly expenses look too large")
  ),
  savings: amount("Savings", (n) => n.min(0, "Savings cannot be negative").max(10_000_000_000, "Savings look too large")),
  creditScore: amount("Credit score", (n) =>
    n
      .int("Credit score must be a whole number")
      .min(300, "Credit score must be between 300 and 850")
      .max(850, "Credit score must be between 300 and 850")
  ),
  financialGoal: z
    .string()
    .trim()
    .max(200, "Financial goal must be 200 characters or fewer")
    // Why: nullish so output of this schema (null goal) re-validates in the Financial Data Service.
    .nullish()
    .transform((value) => (value ? value : null))
});

export type FinancialProfileInput = z.infer<typeof financialProfileSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}
