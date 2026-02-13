import "dotenv/config";
import { ZodError } from "zod";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import { getUserSessionById, loginOrCreateUser } from "../../../lib/microservices/auth-core";

const app = createServiceApp("auth");

app.post("/auth/login", async (request, response) => {
  const body = (request.body ?? {}) as { idNumberOrPassport?: string };

  try {
    const session = await loginOrCreateUser(String(body.idNumberOrPassport ?? ""));
    response.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ message: error.issues[0]?.message ?? "Invalid identifier" });
      return;
    }

    response.status(500).json({ message: "Unable to start session" });
  }
});

app.get("/auth/users/:userId", async (request, response) => {
  const session = await getUserSessionById(String(request.params.userId ?? ""));
  if (!session) {
    response.status(404).json({ message: "User not found" });
    return;
  }

  response.json(session);
});

const port = resolvePort(process.env.AUTH_SERVICE_PORT, 4101);
app.listen(port, () => {
  console.log(`finaware-auth listening on ${port}`);
});
