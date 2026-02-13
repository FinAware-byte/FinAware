import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { pdfPasswordSchema } from "../../../lib/validation";
import { generateOverviewPdfForUser } from "../../../lib/microservices/pdf-service";

const app = createServiceApp("pdf");

app.post("/pdf/overview/:userId", async (request, response) => {
  const parsed = pdfPasswordSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid password input" });
    return;
  }

  const result = await generateOverviewPdfForUser({
    userId: String(request.params.userId ?? ""),
    password: parsed.data.password
  });

  if (!result.ok) {
    response.status(result.status).json({ message: result.message });
    return;
  }

  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Disposition", "attachment; filename=finaware-overview.pdf");
  response.status(200).send(Buffer.from(result.bytes));
});

const port = resolvePort(process.env.PDF_SERVICE_PORT, 4107);
app.listen(port, () => {
  console.log(`finaware-pdf listening on ${port}`);
});
