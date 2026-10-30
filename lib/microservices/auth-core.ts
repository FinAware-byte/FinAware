import {
  ensureUserByIdentifier,
  findUserByIdentifier,
  getUserById,
  markUserAsFicaVerified
} from "@/lib/db/users";
import { authLoginSchema, ficaVerificationSchema } from "@/lib/validation";
import type { PassportCountry, RiskStatus } from "@/lib/domain";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export type FicaFileMeta = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type FicaVerificationInput = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
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
  password?: string;
  authIntent?: AuthIntent;
}): Promise<AuthSessionResponse> {
  const parsed = authLoginSchema.parse({
    idNumberOrPassport: input.idNumberOrPassport,
    documentType: input.documentType,
    passportCountry: input.passportCountry,
    password: input.password
  });
  const authIntent = input.authIntent === "login" ? "login" : "join";

  if (authIntent === "login") {
    const candidates = [parsed.idNumberOrPassport, parsed.idNumberOrPassport.toUpperCase()].filter(
      (value, index, arr) => arr.indexOf(value) === index
    );
    for (const candidate of candidates) {
      const user = await findUserByIdentifier(candidate);
      if (user && user.authPasswordHash && verifyPassword(parsed.password, user.authPasswordHash)) {
        return toSessionResponse(user);
      }
    }
    throw new AuthFlowError("Invalid ID/Passport or password.", 401);
  }

  const user = await ensureUserByIdentifier({
    idNumberOrPassport: parsed.idNumberOrPassport,
    documentType: parsed.documentType,
    passportCountry: parsed.passportCountry,
    authPasswordHash: hashPassword(parsed.password)
  });
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
