import { DebtStatus, DebtType, EmploymentStatus, RiskStatus, type RiskStatus as RiskStatusValue } from "@/lib/domain";
import { createSeededRandom, hashString, pickOne, randomFloat, randomInt } from "@/lib/simulation/seed";
import { getRiskStatusFromIdentifier } from "@/lib/simulation/risk";

const firstNames = [
  "Thabo",
  "Anele",
  "Lerato",
  "Nandi",
  "Sipho",
  "Ayanda",
  "Kagiso",
  "Naledi",
  "Zanele",
  "Mpho"
];

const surnames = [
  "Mokoena",
  "Dlamini",
  "Ndlovu",
  "Petersen",
  "Naidoo",
  "Mahlangu",
  "Radebe",
  "Khumalo",
  "Maseko",
  "Jacobs"
];

const creditors = [
  "FNB",
  "ABSA",
  "Standard Bank",
  "Capitec",
  "WesBank",
  "Woolworths",
  "Truworths",
  "Edgars",
  "NSFAS"
];

const debtTypes = [
  DebtType.MORTGAGE,
  DebtType.VEHICLE,
  DebtType.CREDIT_CARD,
  DebtType.STORE_CARD,
  DebtType.STUDENT_LOAN,
  DebtType.PERSONAL_LOAN,
  DebtType.CHILD_MAINTENANCE,
  DebtType.OVERDRAFT,
  DebtType.OTHER
];

function getDebtCountRange(riskStatus: RiskStatusValue): [number, number] {
  if (riskStatus === RiskStatus.HIGH) return [4, 6];
  if (riskStatus === RiskStatus.MEDIUM) return [3, 5];
  return [2, 2];
}

function getCreditScoreRange(riskStatus: RiskStatusValue): [number, number] {
  if (riskStatus === RiskStatus.HIGH) return [300, 619];
  if (riskStatus === RiskStatus.MEDIUM) return [620, 739];
  return [740, 820];
}

function getEmploymentStatus(random: () => number, riskStatus: RiskStatusValue): EmploymentStatus {
  if (riskStatus === RiskStatus.HIGH) {
    return pickOne(
      [EmploymentStatus.UNEMPLOYED, EmploymentStatus.SELF_EMPLOYED, EmploymentStatus.EMPLOYED],
      random
    );
  }
  if (riskStatus === RiskStatus.MEDIUM) {
    return pickOne(
      [EmploymentStatus.EMPLOYED, EmploymentStatus.SELF_EMPLOYED, EmploymentStatus.STUDENT],
      random
    );
  }
  return pickOne([EmploymentStatus.EMPLOYED, EmploymentStatus.SELF_EMPLOYED], random);
}

export type SimulatedDebt = {
  creditorName: string;
  debtType: DebtType;
  interestRate: number;
  balance: number;
  status: DebtStatus;
  missedPaymentsCount: number;
  hasLegalJudgment: boolean;
};

export function estimateMonthlyObligation(balance: number, interestRate: number): number {
  return Number(Math.max(350, (balance * (interestRate / 100)) / 12 + balance * 0.015).toFixed(2));
}

export function generateProfileAndDebts(idNumberOrPassport: string): {
  user: {
    idNumber: string;
    name: string;
    surname: string;
    employmentStatus: EmploymentStatus;
    monthlyIncome: number;
    riskLevel: RiskStatus;
    realAge: number;
  };
  creditScore: number;
  debts: SimulatedDebt[];
} {
  const seed = hashString(idNumberOrPassport);
  const random = createSeededRandom(seed);
  const riskStatus = getRiskStatusFromIdentifier(idNumberOrPassport);
  const [scoreMin, scoreMax] = getCreditScoreRange(riskStatus);
  const [debtMin, debtMax] = getDebtCountRange(riskStatus);

  const name = pickOne(firstNames, random);
  const surname = pickOne(surnames, random);
  const employmentStatus = getEmploymentStatus(random, riskStatus);
  const realAge = randomInt(21, 62, random);

  const incomeBand =
    riskStatus === RiskStatus.HIGH
      ? [6500, 22000]
      : riskStatus === RiskStatus.MEDIUM
        ? [12000, 42000]
        : [25000, 90000];

  const monthlyIncome = randomFloat(incomeBand[0], incomeBand[1], random);
  const creditScore = randomInt(scoreMin, scoreMax, random);

  const debtCount = randomInt(debtMin, debtMax, random);
  const debts: SimulatedDebt[] = Array.from({ length: debtCount }).map(() => {
    const debtType = pickOne(debtTypes, random);
    const creditorName = pickOne(creditors, random);

    const baseBalance =
      debtType === DebtType.MORTGAGE
        ? randomFloat(450000, 1900000, random)
        : debtType === DebtType.VEHICLE
          ? randomFloat(90000, 550000, random)
          : debtType === DebtType.STUDENT_LOAN
            ? randomFloat(20000, 300000, random)
            : randomFloat(3000, 150000, random);

    const statusRandom = random();
    const status =
      riskStatus === RiskStatus.HIGH && statusRandom > 0.8
        ? DebtStatus.GARNISHED
        : riskStatus !== RiskStatus.LOW && statusRandom > 0.65
          ? DebtStatus.RECONSIDERED
          : DebtStatus.ACTIVE;

    const missedPaymentsCount =
      riskStatus === RiskStatus.HIGH
        ? randomInt(2, 10, random)
        : riskStatus === RiskStatus.MEDIUM
          ? randomInt(1, 5, random)
          : randomInt(0, 2, random);

    const legalJudgmentLikelihood =
      riskStatus === RiskStatus.HIGH ? 0.35 : riskStatus === RiskStatus.MEDIUM ? 0.12 : 0.03;

    const hasLegalJudgment = random() < legalJudgmentLikelihood;
    const interestRate =
      debtType === DebtType.MORTGAGE
        ? randomFloat(7.5, 12.5, random)
        : debtType === DebtType.STUDENT_LOAN
          ? randomFloat(0, 8.0, random)
          : randomFloat(10.0, 29.0, random);

    return {
      creditorName,
      debtType,
      interestRate,
      balance: Number(baseBalance.toFixed(2)),
      status,
      missedPaymentsCount,
      hasLegalJudgment
    };
  });

  return {
    user: {
      idNumber: idNumberOrPassport,
      name,
      surname,
      employmentStatus,
      monthlyIncome,
      riskLevel: riskStatus,
      realAge
    },
    creditScore,
    debts
  };
}
