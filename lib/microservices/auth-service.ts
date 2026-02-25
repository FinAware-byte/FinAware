import { getSessionUserId, setSessionUserId } from "@/lib/auth/session";
import { loginOrCreateUser, getUserSessionById, type AuthSessionResponse } from "@/lib/microservices/auth-core";

export async function loginWithIdentifier(input: {
  idNumberOrPassport: string;
  documentType?: "SA_ID" | "PASSPORT";
  passportCountry?: string | null;
}): Promise<AuthSessionResponse> {
  const session = await loginOrCreateUser(input);
  setSessionUserId(session.userId);
  return session;
}

export async function getCurrentSession(): Promise<AuthSessionResponse | null> {
  const userId = getSessionUserId();
  if (!userId) return null;
  return getUserSessionById(userId);
}
