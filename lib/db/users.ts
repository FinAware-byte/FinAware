import { prisma } from "@/lib/db/prisma";
import {
  type AppUser,
  type IdentificationType,
  type PassportCountry,
  toDebtStatus,
  toDocumentType,
  toEmploymentStatus,
  toPassportCountry,
  toRiskStatus
} from "@/lib/domain";
import { generateProfileAndDebts } from "@/lib/simulation/generator";
import { creditScoreFor, isJudgmentRecord } from "@/lib/finance/credit-score";
import { monthlyPaymentFor } from "@/lib/finance/repayment";

function parseUserId(userId: string): number | null {
  const value = Number(userId);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function mapDbUserToAppUser(user: {
  user_id: number;
  id_number: string;
  document_type: string;
  passport_country: string | null;
  name: string;
  surname: string;
  employment_status: string;
  monthly_income: number;
  risk_level: string;
  real_age: number;
  bank_account_number: string | null;
  is_fica_verified: boolean;
  fica_verified_at: Date | null;
  fica_documents_json: string | null;
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
    documentType: toDocumentType(user.document_type),
    passportCountry: toPassportCountry(user.passport_country),
    bankAccountNumber: user.bank_account_number,
    employmentStatus: toEmploymentStatus(user.employment_status),
    monthlyIncome: user.monthly_income,
    realAge: user.real_age,
    creditScore,
    totalDebt,
    monthlyObligations,
    riskStatus: toRiskStatus(user.risk_level),
    isFicaVerified: user.is_fica_verified,
    ficaVerifiedAt: user.fica_verified_at,
    ficaDocumentsJson: user.fica_documents_json,
    downloadPasswordHash: user.download_password_hash
  };
}

async function refreshCreditProfileTotalsInternal(userId: number): Promise<void> {
  const [user, allDebts, legalRecords] = await Promise.all([
    prisma.users.findUnique({ where: { user_id: userId }, select: { monthly_income: true } }),
    prisma.debts.findMany({ where: { user_id: userId }, include: { payment_history: true } }),
    prisma.legalRecords.findMany({ where: { user_id: userId }, select: { record_type: true } })
  ]);
  const hasJudgment = legalRecords.some((record) => isJudgmentRecord(record.record_type));

  const activeDebts = allDebts.filter((debt) => toDebtStatus(debt.status) === "ACTIVE");
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const monthlyObligations = activeDebts.reduce(
    (sum, debt) =>
      sum + monthlyPaymentFor({ balance: debt.balance, interestRate: debt.interest_rate, debtType: debt.debt_type }),
    0
  );

  // The score is a consequence of the accounts, so it is recalculated here — the one place that
  // already runs whenever a debt is added, changed or removed. Credit_Profile.credit_score is a
  // cache of this calculation, never a value anyone typed.
  const creditScore = creditScoreFor({
    monthlyIncome: user?.monthly_income ?? 0,
    debts: allDebts.map((debt) => ({
      debtTypeStored: debt.debt_type,
      status: toDebtStatus(debt.status),
      balance: debt.balance,
      monthlyObligation: monthlyPaymentFor({
        balance: debt.balance,
        interestRate: debt.interest_rate,
        debtType: debt.debt_type
      }),
      paymentsMadeCount: debt.payment_history.filter((entry) => entry.paid).length,
      totalPaymentsCount: debt.payment_history.length,
      missedPaymentsCount: debt.payment_history.filter((entry) => entry.missed).length,
      hasLegalJudgment: hasJudgment
    }))
  });

  await prisma.creditProfile.updateMany({
    where: { user_id: userId },
    data: {
      total_debt: Number(totalDebt.toFixed(2)),
      monthly_obligations: Number(monthlyObligations.toFixed(2)),
      credit_score: creditScore
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

type EnsureUserInput = {
  idNumberOrPassport: string;
  documentType: IdentificationType;
  passportCountry: PassportCountry | null;
};

export async function ensureUserByIdentifier(input: EnsureUserInput): Promise<AppUser> {
  const existing = await findUserByIdentifier(input.idNumberOrPassport);
  if (existing) return existing;

  const simulated = generateProfileAndDebts(input.idNumberOrPassport);

  const createdUser = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        id_number: simulated.user.idNumber,
        document_type: input.documentType,
        passport_country: input.documentType === "PASSPORT" ? input.passportCountry : null,
        name: simulated.user.name,
        surname: simulated.user.surname,
        employment_status: simulated.user.employmentStatus,
        monthly_income: simulated.user.monthlyIncome,
        risk_level: simulated.user.riskLevel,
        real_age: simulated.user.realAge,
        bank_account_number: null,
        is_fica_verified: false,
        fica_verified_at: null,
        fica_documents_json: null,
        download_password_hash: null
      }
    });

    const createdDebts = [] as {
      debt_id: number;
      creditor_name: string;
      status: string;
      balance: number;
      interest_rate: number;
      debt_type: string;
      missedPaymentsCount: number;
      hasLegalJudgment: boolean;
    }[];

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
        debt_type: createdDebt.debt_type,
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
      (sum, debt) =>
      sum + monthlyPaymentFor({ balance: debt.balance, interestRate: debt.interest_rate, debtType: debt.debt_type }),
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

export async function markUserAsFicaVerified(
  userId: string,
  documentsJson: string
): Promise<AppUser | null> {
  const parsed = parseUserId(userId);
  if (!parsed) return null;

  const updated = await prisma.users.update({
    where: { user_id: parsed },
    data: {
      is_fica_verified: true,
      fica_verified_at: new Date(),
      fica_documents_json: documentsJson
    },
    include: { credit_profile: true }
  });

  return mapDbUserToAppUser(updated);
}
