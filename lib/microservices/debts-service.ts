import { type DebtStatus, type DebtType } from "@/lib/domain";
import { createDebtForUser, listDebtsForUser, updateDebtEditableFields } from "@/lib/db/debts";

export async function listUserDebts(userId: string) {
  return listDebtsForUser(userId);
}

export async function createUserDebt(input: {
  userId: string;
  creditorName: string;
  debtType: DebtType;
  interestRate: number;
  balance: number;
  status: DebtStatus;
}) {
  return createDebtForUser(input);
}

export async function updateUserDebt(input: {
  userId: string;
  debtId: string;
  status?: DebtStatus;
}) {
  return updateDebtEditableFields(input.userId, input.debtId, { status: input.status });
}
