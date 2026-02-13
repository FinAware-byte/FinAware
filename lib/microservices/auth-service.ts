import { getSessionUserId, setSessionUserId } from "@/lib/auth/session";
import { loginOrCreateUser, getUserSessionById, type AuthSessionResponse } from "@/lib/microservices/auth-core";

export async function loginWithIdentifier(idNumberOrPassport: string): Promise<AuthSessionResponse> {
  const session = await loginOrCreateUser(idNumberOrPassport);
  setSessionUserId(session.userId);
  return session;
}

export async function getCurrentSession(): Promise<AuthSessionResponse | null> {
  const userId = getSessionUserId();
  if (!userId) return null;
  return getUserSessionById(userId);
}
