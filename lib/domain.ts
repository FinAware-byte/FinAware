import {
  identificationTypeValues,
  passportCountryValues,
  type IdentificationType,
  type PassportCountry
} from "@/lib/identification/rules";

export const RiskStatus = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW"
} as const;
export type RiskStatus = (typeof RiskStatus)[keyof typeof RiskStatus];
export const riskStatusValues = Object.values(RiskStatus);
export function toRiskStatus(value: string): RiskStatus {
  const normalized = value.trim().toUpperCase();
  if (normalized === "HIGH") return RiskStatus.HIGH;
  if (normalized === "MEDIUM") return RiskStatus.MEDIUM;
  if (normalized === "LOW") return RiskStatus.LOW;
  return riskStatusValues.includes(value as RiskStatus) ? (value as RiskStatus) : RiskStatus.LOW;
}

export const EmploymentStatus = {
  EMPLOYED: "EMPLOYED",
  UNEMPLOYED: "UNEMPLOYED",
  SELF_EMPLOYED: "SELF_EMPLOYED",
  STUDENT: "STUDENT"
} as const;
export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];
export const employmentStatusValues = Object.values(EmploymentStatus);
export function toEmploymentStatus(value: string): EmploymentStatus {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "EMPLOYED") return EmploymentStatus.EMPLOYED;
  if (normalized === "UNEMPLOYED") return EmploymentStatus.UNEMPLOYED;
  if (normalized === "SELF_EMPLOYED") return EmploymentStatus.SELF_EMPLOYED;
  if (normalized === "STUDENT") return EmploymentStatus.STUDENT;
  return employmentStatusValues.includes(value as EmploymentStatus)
    ? (value as EmploymentStatus)
    : EmploymentStatus.EMPLOYED;
}

export const DebtType = {
  MORTGAGE: "MORTGAGE",
  VEHICLE: "VEHICLE",
  CREDIT_CARD: "CREDIT_CARD",
  STORE_CARD: "STORE_CARD",
  STUDENT_LOAN: "STUDENT_LOAN",
  PERSONAL_LOAN: "PERSONAL_LOAN",
  CHILD_MAINTENANCE: "CHILD_MAINTENANCE",
  OVERDRAFT: "OVERDRAFT",
  OTHER: "OTHER"
} as const;
export type DebtType = (typeof DebtType)[keyof typeof DebtType];
export const debtTypeValues = Object.values(DebtType);
export function toDebtType(value: string): DebtType {
  return debtTypeValues.includes(value as DebtType) ? (value as DebtType) : DebtType.OTHER;
}

export const DebtStatus = {
  ACTIVE: "ACTIVE",
  RECONSIDERED: "RECONSIDERED",
  GARNISHED: "GARNISHED"
} as const;
export type DebtStatus = (typeof DebtStatus)[keyof typeof DebtStatus];
export const debtStatusValues = Object.values(DebtStatus);
export function toDebtStatus(value: string): DebtStatus {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (normalized === "ACTIVE") return DebtStatus.ACTIVE;
  if (normalized === "RECONSIDERED") return DebtStatus.RECONSIDERED;
  if (normalized === "GARNISHED") return DebtStatus.GARNISHED;
  return debtStatusValues.includes(value as DebtStatus) ? (value as DebtStatus) : DebtStatus.ACTIVE;
}

export const AssistanceType = {
  FINANCIAL_ADVISOR: "FINANCIAL_ADVISOR",
  DEBT_COUNSELLOR: "DEBT_COUNSELLOR",
  LEGAL_ADVISOR: "LEGAL_ADVISOR"
} as const;
export type AssistanceType = (typeof AssistanceType)[keyof typeof AssistanceType];
export const assistanceTypeValues = Object.values(AssistanceType);
export function toAssistanceType(value: string): AssistanceType {
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "FINANCIAL" || normalized === "FINANCIAL_ADVISOR") {
    return AssistanceType.FINANCIAL_ADVISOR;
  }
  if (normalized === "DEBT" || normalized === "DEBT_COUNSELLOR") {
    return AssistanceType.DEBT_COUNSELLOR;
  }
  if (normalized === "LEGAL" || normalized === "LEGAL_ADVISOR") {
    return AssistanceType.LEGAL_ADVISOR;
  }
  return assistanceTypeValues.includes(value as AssistanceType)
    ? (value as AssistanceType)
    : AssistanceType.FINANCIAL_ADVISOR;
}

export const ConsultationStatus = {
  PENDING: "PENDING",
  SENT: "SENT"
} as const;
export type ConsultationStatus = (typeof ConsultationStatus)[keyof typeof ConsultationStatus];
export const consultationStatusValues = Object.values(ConsultationStatus);
export function toConsultationStatus(value: string): ConsultationStatus {
  return consultationStatusValues.includes(value as ConsultationStatus)
    ? (value as ConsultationStatus)
    : ConsultationStatus.PENDING;
}

export const documentTypeValues = identificationTypeValues;
export { type IdentificationType };
export function toDocumentType(value: string): IdentificationType {
  return identificationTypeValues.includes(value as IdentificationType)
    ? (value as IdentificationType)
    : "SA_ID";
}

export const passportCountryCodeValues = passportCountryValues;
export { type PassportCountry };
export function toPassportCountry(value: string | null): PassportCountry | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return passportCountryValues.includes(normalized as PassportCountry)
    ? (normalized as PassportCountry)
    : null;
}

export type AppUser = {
  id: string;
  userId: number;
  fullName: string;
  name: string;
  surname: string;
  idNumberOrPassport: string;
  documentType: IdentificationType;
  passportCountry: PassportCountry | null;
  bankAccountNumber: string | null;
  employmentStatus: EmploymentStatus;
  monthlyIncome: number;
  realAge: number;
  creditScore: number;
  totalDebt: number;
  monthlyObligations: number;
  riskStatus: RiskStatus;
  isFicaVerified: boolean;
  ficaVerifiedAt: Date | null;
  ficaDocumentsJson: string | null;
  downloadPasswordHash: string | null;
};

export type AppDebt = {
  id: string;
  debtId: number;
  userId: number;
  creditorName: string;
  debtType: DebtType;
  interestRate: number;
  balance: number;
  status: DebtStatus;
  monthlyObligation: number;
  paymentsMadeCount: number;
  totalPaymentsCount: number;
  missedPaymentsCount: number;
  hasLegalJudgment: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AppConsultationRequest = {
  id: string;
  requestId: number;
  assistanceType: AssistanceType;
  message: string;
  status: ConsultationStatus;
  createdAt: Date;
};
