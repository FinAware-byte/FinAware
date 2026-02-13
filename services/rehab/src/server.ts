import "dotenv/config";
import { z } from "zod";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { getRehabPlanForUser } from "../../../lib/microservices/rehab-service";

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

const app = createServiceApp("rehab");

app.post("/rehab/plan/:userId", async (request, response) => {
  const parsedContext = recommendationContextSchema.safeParse(request.body ?? {});
  const context = parsedContext.success ? parsedContext.data : undefined;

  const plan = await getRehabPlanForUser(String(request.params.userId ?? ""), context);
  if (!plan) {
    response.status(404).json({ message: "User not found" });
    return;
  }

  response.json(plan);
});

const port = resolvePort(process.env.REHAB_SERVICE_PORT, 4105);
app.listen(port, () => {
  console.log(`finaware-rehab listening on ${port}`);
});
