import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { createUserDebt, listUserDebts, updateUserDebt } from "../../../lib/microservices/debts-service";
import { createDebtSchema, updateDebtSchema } from "../../../lib/validation";

const app = createServiceApp("debts");

app.get("/debts/:userId", async (request, response) => {
  const debts = await listUserDebts(String(request.params.userId ?? ""));
  response.json(debts);
});

app.post("/debts/:userId", async (request, response) => {
  const parsed = createDebtSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid debt payload" });
    return;
  }

  const debt = await createUserDebt({
    userId: String(request.params.userId ?? ""),
    ...parsed.data
  });
  response.status(201).json(debt);
});

app.patch("/debts/:userId/:debtId", async (request, response) => {
  const parsed = updateDebtSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid update payload" });
    return;
  }

  const debt = await updateUserDebt({
    userId: String(request.params.userId ?? ""),
    debtId: String(request.params.debtId ?? ""),
    status: parsed.data.status
  });

  response.json(debt);
});

const port = resolvePort(process.env.DEBTS_SERVICE_PORT, 4104);
app.listen(port, () => {
  console.log(`finaware-debts listening on ${port}`);
});
