import { ensureUserByIdentifier, getUserById } from "@/lib/db/users";
import { idOrPassportSchema } from "@/lib/validation";
import type { RiskStatus } from "@/lib/domain";

export type AuthSessionResponse = {
  userId: string;
  fullName: string;
  riskStatus: RiskStatus;
};

function toSessionResponse(user: { id: string; fullName: string; riskStatus: RiskStatus }): AuthSessionResponse {
  return {
    userId: user.id,
    fullName: user.fullName,
    riskStatus: user.riskStatus
  };
}

export async function loginOrCreateUser(idNumberOrPassport: string): Promise<AuthSessionResponse> {
  const parsed = idOrPassportSchema.parse(idNumberOrPassport.trim());
  const user = await ensureUserByIdentifier(parsed);
  return toSessionResponse(user);
}

export async function getUserSessionById(userId: string): Promise<AuthSessionResponse | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  return toSessionResponse(user);
}
