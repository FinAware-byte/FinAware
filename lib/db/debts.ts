import { prisma } from "@/lib/db/prisma";
import { type AppDebt, type DebtStatus, type DebtType, toDebtStatus, toDebtType } from "@/lib/domain";
import { estimateMonthlyObligation } from "@/lib/simulation/generator";
import { refreshCreditProfileTotals } from "@/lib/db/users";

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function mapDbDebtToAppDebt(
  debt: {
    debt_id: number;
    user_id: number;
    creditor_name: string;
    debt_type: string;
    interest_rate: number;
    balance: number;
    status: string;
    created_at: Date;
    updated_at: Date;
    payment_history: { missed: boolean; paid: boolean }[];
  },
  hasLegalJudgment: boolean
): AppDebt {
  const missedPaymentsCount = debt.payment_history.filter((entry) => entry.missed).length;
  const paymentsMadeCount = debt.payment_history.filter((entry) => entry.paid).length;
  const totalPaymentsCount = debt.payment_history.length;

  return {
    id: String(debt.debt_id),
    debtId: debt.debt_id,
    userId: debt.user_id,
    creditorName: debt.creditor_name,
    debtType: toDebtType(debt.debt_type),
    interestRate: debt.interest_rate,
    balance: debt.balance,
    status: toDebtStatus(debt.status),
    monthlyObligation: estimateMonthlyObligation(debt.balance, debt.interest_rate),
    paymentsMadeCount,
    totalPaymentsCount,
    missedPaymentsCount,
    hasLegalJudgment,
    createdAt: debt.created_at,
    updatedAt: debt.updated_at
  };
}

export async function listDebtsForUser(userId: string): Promise<AppDebt[]> {
  const parsedUserId = parseId(userId);
  if (!parsedUserId) return [];

  const [debts, legalCount] = await Promise.all([
    prisma.debts.findMany({
      where: { user_id: parsedUserId },
      include: { payment_history: true },
      orderBy: [{ status: "asc" }, { created_at: "desc" }]
    }),
    prisma.legalRecords.count({
      where: { user_id: parsedUserId, record_type: { contains: "Judgment" } }
    })
  ]);

  const hasLegalJudgment = legalCount > 0;
  return debts.map((debt) => mapDbDebtToAppDebt(debt, hasLegalJudgment));
}

export type CreateDebtInput = {
  userId: string;
  creditorName: string;
  debtType: DebtType;
  interestRate: number;
  balance: number;
  status: DebtStatus;
};

export async function createDebtForUser(input: CreateDebtInput): Promise<AppDebt> {
  const parsedUserId = parseId(input.userId);
  if (!parsedUserId) {
    throw new Error("Invalid user id");
  }

  const created = await prisma.debts.create({
    data: {
      user_id: parsedUserId,
      creditor_name: input.creditorName,
      debt_type: input.debtType,
      interest_rate: input.interestRate,
      balance: input.balance,
      status: input.status
    },
    include: { payment_history: true }
  });

  await refreshCreditProfileTotals(input.userId);

  const legalCount = await prisma.legalRecords.count({
    where: { user_id: parsedUserId, record_type: { contains: "Judgment" } }
  });

  return mapDbDebtToAppDebt(created, legalCount > 0);
}

export async function updateDebtEditableFields(
  userId: string,
  debtId: string,
  payload: { status?: DebtStatus }
): Promise<AppDebt> {
  const parsedUserId = parseId(userId);
  const parsedDebtId = parseId(debtId);
  if (!parsedUserId || !parsedDebtId) {
    throw new Error("Invalid identifiers");
  }

  const existing = await prisma.debts.findFirst({
    where: { debt_id: parsedDebtId, user_id: parsedUserId }
  });

  if (!existing) {
    throw new Error("Debt not found for user");
  }

  const updated = await prisma.debts.update({
    where: { debt_id: parsedDebtId },
    data: {
      status: payload.status
    },
    include: { payment_history: true }
  });

  if (payload.status === "GARNISHED") {
    await prisma.legalRecords.create({
      data: {
        user_id: parsedUserId,
        record_type: "Garnishee",
        description: `Debt ${updated.creditor_name} marked as garnished`
      }
    });
  }

  await refreshCreditProfileTotals(userId);

  const legalCount = await prisma.legalRecords.count({
    where: { user_id: parsedUserId, record_type: { contains: "Judgment" } }
  });

  return mapDbDebtToAppDebt(updated, legalCount > 0);
}

// Why: no delete helper is intentionally provided so debt removal is blocked at the service boundary.
export const debtDeleteDisabled = true;
