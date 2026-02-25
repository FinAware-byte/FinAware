import "dotenv/config";
import { ZodError } from "zod";
import { createServiceApp, resolvePort } from "../../../services/shared/boot";
import {
  AuthFlowError,
  getFirstZodIssueMessage,
  getUserSessionById,
  loginOrCreateUser,
  verifyFicaForUser
} from "../../../lib/microservices/auth-core";

const app = createServiceApp("auth");

app.post("/auth/login", async (request, response) => {
  const body = (request.body ?? {}) as {
    idNumberOrPassport?: string;
    documentType?: "SA_ID" | "PASSPORT";
    passportCountry?: string | null;
    authIntent?: "join" | "login";
  };

  try {
    const session = await loginOrCreateUser({
      idNumberOrPassport: String(body.idNumberOrPassport ?? ""),
      documentType: body.documentType,
      passportCountry: body.passportCountry,
      authIntent: body.authIntent
    });
    response.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ message: error.issues[0]?.message ?? "Invalid identifier" });
      return;
    }

    if (error instanceof AuthFlowError) {
      response.status(error.status).json({ message: error.message });
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

app.post("/auth/fica/verify", async (request, response) => {
  const body = (request.body ?? {}) as {
    userId?: string;
    consentAccepted?: boolean;
    useDemoPlaceholder?: boolean;
    identityDocument?: { fileName?: string; mimeType?: string; sizeBytes?: number };
    proofOfAddress?: { fileName?: string; mimeType?: string; sizeBytes?: number };
    bankStatement?: { fileName?: string; mimeType?: string; sizeBytes?: number } | null;
  };

  try {
    const userId = String(body.userId ?? "");
    const session = await verifyFicaForUser(userId, {
      consentAccepted: Boolean(body.consentAccepted),
      useDemoPlaceholder: Boolean(body.useDemoPlaceholder),
      identityDocument: {
        fileName: String(body.identityDocument?.fileName ?? ""),
        mimeType: String(body.identityDocument?.mimeType ?? ""),
        sizeBytes: Number(body.identityDocument?.sizeBytes ?? 0)
      },
      proofOfAddress: {
        fileName: String(body.proofOfAddress?.fileName ?? ""),
        mimeType: String(body.proofOfAddress?.mimeType ?? ""),
        sizeBytes: Number(body.proofOfAddress?.sizeBytes ?? 0)
      },
      bankStatement: body.bankStatement
        ? {
            fileName: String(body.bankStatement.fileName ?? ""),
            mimeType: String(body.bankStatement.mimeType ?? ""),
            sizeBytes: Number(body.bankStatement.sizeBytes ?? 0)
          }
        : null
    });

    if (!session) {
      response.status(404).json({ message: "User not found" });
      return;
    }

    response.json(session);
  } catch (error) {
    if (error instanceof ZodError) {
      response.status(400).json({ message: error.issues[0]?.message ?? "Invalid FICA payload" });
      return;
    }

    response.status(500).json({ message: getFirstZodIssueMessage(error) });
  }
});

const port = resolvePort(process.env.AUTH_SERVICE_PORT, 4101);
app.listen(port, () => {
  console.log(`finaware-auth listening on ${port}`);
});
