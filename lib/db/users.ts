import { prisma } from "@/lib/db/prisma";
import { type AppUser, toEmploymentStatus, toRiskStatus } from "@/lib/domain";
import { estimateMonthlyObligation, generateProfileAndDebts } from "@/lib/simulation/generator";

function parseUserId(userId: string): number | null {
  const value = Number(userId);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function mapDbUserToAppUser(user: {
  user_id: number;
  id_number: string;
  name: string;
  surname: string;
  employment_status: string;
  monthly_income: number;
  risk_level: string;
  real_age: number;
  bank_account_number: string | null;
  download_password_hash: string | null;
  credit_profile: {
    credit_score: number;
    total_debt: number;
    monthly_obligations: number;
  } | null;
}): AppUser {
  const creditScore = user.credit_profile?.credit_score ?? 0;
  const totalDebt = user.credit_profile?.total_debt ?? 0;
  const monthlyObligations = user.credit_profile?.monthly_obligations ?? 0;

  return {
    id: String(user.user_id),
    userId: user.user_id,
    fullName: `${user.name} ${user.surname}`.trim(),
    name: user.name,
    surname: user.surname,
    idNumberOrPassport: user.id_number,
    bankAccountNumber: user.bank_account_number,
    employmentStatus: toEmploymentStatus(user.employment_status),
    monthlyIncome: user.monthly_income,
    realAge: user.real_age,
    creditScore,
    totalDebt,
    monthlyObligations,
    riskStatus: toRiskStatus(user.risk_level),
    downloadPasswordHash: user.download_password_hash
  };
}

async function refreshCreditProfileTotalsInternal(userId: number): Promise<void> {
  const activeDebts = await prisma.debts.findMany({
    where: { user_id: userId, status: "ACTIVE" }
  });

  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const monthlyObligations = activeDebts.reduce(
    (sum, debt) => sum + estimateMonthlyObligation(debt.balance, debt.interest_rate),
    0
  );

  await prisma.creditProfile.updateMany({
    where: { user_id: userId },
    data: {
      total_debt: Number(totalDebt.toFixed(2)),
      monthly_obligations: Number(monthlyObligations.toFixed(2))
    }
  });
}

export async function refreshCreditProfileTotals(userId: string): Promise<void> {
  const parsed = parseUserId(userId);
  if (!parsed) return;
  await refreshCreditProfileTotalsInternal(parsed);
}

export async function findUserByIdentifier(idNumberOrPassport: string): Promise<AppUser | null> {
  const row = await prisma.users.findUnique({
    where: { id_number: idNumberOrPassport },
    include: { credit_profile: true }
  });

  if (!row) return null;
  return mapDbUserToAppUser(row);
}

export async function ensureUserByIdentifier(idNumberOrPassport: string): Promise<AppUser> {
  const existing = await findUserByIdentifier(idNumberOrPassport);
  if (existing) return existing;

  const simulated = generateProfileAndDebts(idNumberOrPassport);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        id_number: simulated.user.idNumber,
        name: simulated.user.name,
        surname: simulated.user.surname,
        employment_status: simulated.user.employmentStatus,
        monthly_income: simulated.user.monthlyIncome,
        risk_level: simulated.user.riskLevel,
        real_age: simulated.user.realAge,
        bank_account_number: null,
        download_password_hash: null
      }
    });

    const createdDebts = [] as { debt_id: number; creditor_name: string; status: string; balance: number; interest_rate: number; missedPaymentsCount: number; hasLegalJudgment: boolean; }[];

    for (const debt of simulated.debts) {
      const createdDebt = await tx.debts.create({
        data: {
          user_id: user.user_id,
          creditor_name: debt.creditorName,
          debt_type: debt.debtType,
          interest_rate: debt.interestRate,
          balance: debt.balance,
          status: debt.status
        }
      });

      createdDebts.push({
        debt_id: createdDebt.debt_id,
        creditor_name: createdDebt.creditor_name,
        status: createdDebt.status,
        balance: createdDebt.balance,
        interest_rate: createdDebt.interest_rate,
        missedPaymentsCount: debt.missedPaymentsCount,
        hasLegalJudgment: debt.hasLegalJudgment
      });
    }

    const now = new Date();
    for (const debt of createdDebts) {
      const totalRows = Math.max(3, debt.missedPaymentsCount + 1);
      for (let monthOffset = 0; monthOffset < totalRows; monthOffset += 1) {
        const dueDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 5);
        const missed = monthOffset < debt.missedPaymentsCount;

        await tx.paymentHistory.create({
          data: {
            debt_id: debt.debt_id,
            due_date: dueDate,
            paid: !missed,
            missed
          }
        });
      }

      if (debt.hasLegalJudgment) {
        await tx.legalRecords.create({
          data: {
            user_id: user.user_id,
            record_type: "Judgment",
            description: `Legal judgment linked to ${debt.creditor_name}`
          }
        });
      }

      if (debt.status === "GARNISHED") {
        await tx.legalRecords.create({
          data: {
            user_id: user.user_id,
            record_type: "Garnishee",
            description: `Garnishee order linked to ${debt.creditor_name}`
          }
        });
      }
    }

    const activeDebts = createdDebts.filter((debt) => debt.status === "ACTIVE");
    const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
    const monthlyObligations = activeDebts.reduce(
      (sum, debt) => sum + estimateMonthlyObligation(debt.balance, debt.interest_rate),
      0
    );

    await tx.creditProfile.create({
      data: {
        user_id: user.user_id,
        credit_score: simulated.creditScore,
        total_debt: Number(totalDebt.toFixed(2)),
        monthly_obligations: Number(monthlyObligations.toFixed(2))
      }
    });

    return tx.users.findUnique({
      where: { user_id: user.user_id },
      include: { credit_profile: true }
    });
  });

  if (!createdUser) {
    throw new Error("Failed to create user");
  }

  return mapDbUserToAppUser(createdUser);
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const parsed = parseUserId(userId);
  if (!parsed) return null;

  const row = await prisma.users.findUnique({
    where: { user_id: parsed },
    include: { credit_profile: true }
  });

  if (!row) return null;
  return mapDbUserToAppUser(row);
}
