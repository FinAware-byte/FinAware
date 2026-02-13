import "dotenv/config";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { getIdentityProfile, updateIdentityProfile } from "../../../lib/microservices/identity-service";
import { identityUpdateSchema } from "../../../lib/validation";

const app = createServiceApp("identity");

app.get("/identity/profile/:userId", async (request, response) => {
  const profile = await getIdentityProfile(String(request.params.userId ?? ""));
  if (!profile) {
    response.status(404).json({ message: "User not found" });
    return;
  }

  response.json(profile);
});

app.patch("/identity/profile/:userId", async (request, response) => {
  const body = (request.body ?? {}) as unknown;
  const parsed = identityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid profile payload" });
    return;
  }

  const downloadPassword =
    typeof (body as { downloadPassword?: unknown }).downloadPassword === "string"
      ? (body as { downloadPassword: string }).downloadPassword
      : "";

  await updateIdentityProfile(String(request.params.userId ?? ""), {
    ...parsed.data,
    downloadPassword
  });

  const profile = await getIdentityProfile(String(request.params.userId ?? ""));
  if (!profile) {
    response.status(404).json({ message: "User not found" });
    return;
  }

  response.json(profile);
});

const port = resolvePort(process.env.IDENTITY_SERVICE_PORT, 4103);
app.listen(port, () => {
  console.log(`finaware-identity listening on ${port}`);
});
