import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { createHelpRequest, listUserHelpRequests } from "../../../lib/microservices/help-service";
import { consultationSchema } from "../../../lib/validation";

const app = createServiceApp("help");

app.get("/help/requests/:userId", async (request, response) => {
  const requests = await listUserHelpRequests(String(request.params.userId ?? ""));
  response.json(
    requests.map((requestItem) => ({
      ...requestItem,
      createdAt: requestItem.createdAt.toISOString()
    }))
  );
});

app.post("/help/requests/:userId", async (request, response) => {
  const parsed = consultationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }

  const created = await createHelpRequest({
    userId: String(request.params.userId ?? ""),
    assistanceType: parsed.data.assistanceType,
    message: parsed.data.message
  });

  response.json({
    request: {
      ...created.request,
      createdAt: created.request.createdAt.toISOString()
    },
    whatsappUrl: created.whatsappUrl
  });
});

const port = resolvePort(process.env.HELP_SERVICE_PORT, 4106);
app.listen(port, () => {
  console.log(`finaware-help listening on ${port}`);
});
