import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getUserById } from "@/lib/db/users";
import type { EmploymentStatus, RiskStatus } from "@/lib/domain";
import { hashPassword } from "@/lib/auth/password";
import { identityUpdateSchema } from "@/lib/validation";

export type IdentityProfile = {
  userId: string;
  fullName: string;
  idNumberOrPassport: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  employmentStatus: EmploymentStatus;
  realAge: number;
  creditScore: number;
  riskStatus: RiskStatus;
};

export async function getIdentityProfile(userId: string): Promise<IdentityProfile | null> {
  const user = await getUserById(userId);
  if (!user) return null;

  return {
    userId: user.id,
    fullName: user.fullName,
    idNumberOrPassport: user.idNumberOrPassport,
    bankAccountNumber: user.bankAccountNumber,
    monthlyIncome: user.monthlyIncome,
    employmentStatus: user.employmentStatus,
    realAge: user.realAge,
    creditScore: user.creditScore,
    riskStatus: user.riskStatus
  };
}

function splitName(value: string): { name: string; surname: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const name = parts[0] ?? "User";
  const surname = parts.slice(1).join(" ") || "Unknown";
  return { name, surname };
}

type IdentityUpdateInput = z.infer<typeof identityUpdateSchema> & {
  downloadPassword?: string;
};

export async function updateIdentityProfile(userId: string, input: IdentityUpdateInput): Promise<void> {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new Error("Invalid user id");
  }

  const { name, surname } = splitName(input.fullName);
  const downloadPassword = input.downloadPassword?.trim() ?? "";

  await prisma.$transaction(async (tx) => {
    await tx.users.update({
      where: { user_id: parsedUserId },
      data: {
        name,
        surname,
        bank_account_number: input.bankAccountNumber || null,
        monthly_income: input.monthlyIncome,
        employment_status: input.employmentStatus,
        real_age: input.realAge,
        ...(downloadPassword ? { download_password_hash: hashPassword(downloadPassword) } : {})
      }
    });

    await tx.creditProfile.updateMany({
      where: { user_id: parsedUserId },
      data: {
        credit_score: input.creditScore
      }
    });
  });
}
