import {
  ensureUserByIdentifier,
  findUserByIdentifier,
  getUserById,
  markUserAsFicaVerified
} from "@/lib/db/users";
import { authLoginSchema, ficaVerificationSchema } from "@/lib/validation";
import type { PassportCountry, RiskStatus } from "@/lib/domain";
import { z } from "zod";

export type FicaFileMeta = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type FicaVerificationInput = {
  consentAccepted: boolean;
  useDemoPlaceholder?: boolean;
  identityDocument: FicaFileMeta;
  proofOfAddress: FicaFileMeta;
  bankStatement?: FicaFileMeta | null;
};

export type AuthIntent = "join" | "login";

export class AuthFlowError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AuthFlowError";
    this.status = status;
  }
}

export type AuthSessionResponse = {
  userId: string;
  fullName: string;
  riskStatus: RiskStatus;
  idNumberOrPassport: string;
  documentType: "SA_ID" | "PASSPORT";
  passportCountry: PassportCountry | null;
  isFicaVerified: boolean;
};

function toSessionResponse(user: {
  id: string;
  fullName: string;
  riskStatus: RiskStatus;
  idNumberOrPassport: string;
  documentType: "SA_ID" | "PASSPORT";
  passportCountry: PassportCountry | null;
  isFicaVerified: boolean;
}): AuthSessionResponse {
  return {
    userId: user.id,
    fullName: user.fullName,
    riskStatus: user.riskStatus,
    idNumberOrPassport: user.idNumberOrPassport,
    documentType: user.documentType,
    passportCountry: user.passportCountry,
    isFicaVerified: user.isFicaVerified
  };
}

export async function loginOrCreateUser(input: {
  idNumberOrPassport: string;
  documentType?: "SA_ID" | "PASSPORT";
  passportCountry?: string | null;
  authIntent?: AuthIntent;
}): Promise<AuthSessionResponse> {
  const authIntent = input.authIntent === "login" ? "login" : "join";

  if (authIntent === "login") {
    const identifier = String(input.idNumberOrPassport ?? "").trim();
    if (!identifier) {
      throw new AuthFlowError("ID/Passport is required.", 400);
    }

    const candidates = [identifier, identifier.toUpperCase()].filter(
      (value, index, arr) => arr.indexOf(value) === index
    );
    for (const candidate of candidates) {
      const user = await findUserByIdentifier(candidate);
      if (user) {
        return toSessionResponse(user);
      }
    }

    throw new AuthFlowError("No account found for this ID/Passport. Use Join Now to create one.", 404);
  }

  const parsed = authLoginSchema.parse(input);
  const user = await ensureUserByIdentifier(parsed);
  return toSessionResponse(user);
}

export async function getUserSessionById(userId: string): Promise<AuthSessionResponse | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  return toSessionResponse(user);
}

export async function verifyFicaForUser(
  userId: string,
  payload: FicaVerificationInput
): Promise<AuthSessionResponse | null> {
  const parsed = ficaVerificationSchema.parse(payload);
  const updated = await markUserAsFicaVerified(userId, JSON.stringify(parsed));
  if (!updated) return null;
  return toSessionResponse(updated);
}

export function getFirstZodIssueMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? "Invalid payload";
  }
  return "Invalid payload";
}
