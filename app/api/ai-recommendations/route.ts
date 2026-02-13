import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

const recommendationContextSchema = z.object({
  focus: z.string().optional(),
  cashflow: z
    .object({
      monthlyIncome: z.number(),
      nonDebtExpenses: z.number(),
      debtObligations: z.number(),
      netCashflow: z.number(),
      debtToIncomeRatio: z.number(),
      expenseToIncomeRatio: z.number(),
      projectedScoreDelta30d: z.number(),
      scorePressure: z.enum(["POSITIVE", "NEUTRAL", "NEGATIVE"])
    })
    .optional()
});

export async function POST(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const rawBody = (await request.json().catch(() => ({}))) as unknown;
  const parsedContext = recommendationContextSchema.safeParse(rawBody);
  const context = parsedContext.success ? parsedContext.data : undefined;
  const result = await callServiceJson("rehab", `/rehab/plan/${userId}`, {
    method: "POST",
    body: JSON.stringify(context ?? {})
  });
  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(result.payload, { status: result.status });
  }

  const payload = result.payload as { recommendations?: unknown };
  if (!payload.recommendations) {
    return NextResponse.json({ message: "Invalid rehab service response" }, { status: 502 });
  }

  return NextResponse.json(payload.recommendations);
}
