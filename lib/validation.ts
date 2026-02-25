import { z } from "zod";
import {
  assistanceTypeValues,
  debtStatusValues,
  documentTypeValues,
  debtTypeValues,
  employmentStatusValues,
  passportCountryCodeValues,
  type AssistanceType,
  type DebtStatus,
  type DebtType,
  type EmploymentStatus,
  type IdentificationType,
  type PassportCountry
} from "@/lib/domain";

export const idOrPassportSchema = z.string().trim().min(1, "ID/Passport is required");

const documentTypeEnumValues = [...documentTypeValues] as [
  IdentificationType,
  ...IdentificationType[]
];
const passportCountryEnumValues = [...passportCountryCodeValues] as [
  PassportCountry,
  ...PassportCountry[]
];

export const authLoginSchema = z
  .object({
    idNumberOrPassport: idOrPassportSchema,
    documentType: z.enum(documentTypeEnumValues).default("SA_ID"),
    passportCountry: z.enum(passportCountryEnumValues).optional().nullable()
  })
  .transform((value) => ({
    ...value,
    idNumberOrPassport:
      value.documentType === "PASSPORT"
        ? value.idNumberOrPassport.toUpperCase()
        : value.idNumberOrPassport,
    passportCountry: value.passportCountry ?? null
  }));

export const identityUpdateSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  bankAccountNumber: z
    .string()
    .max(40, "Bank account number is too long")
    .optional()
    .or(z.literal("")),
  monthlyIncome: z.coerce.number().min(0, "Monthly income cannot be negative"),
  employmentStatus: z.enum(employmentStatusValues as [EmploymentStatus, ...EmploymentStatus[]]),
  realAge: z.coerce.number().int().min(16, "Real age must be at least 16").max(100),
  creditScore: z.coerce.number().int().min(300).max(900)
});

export const createDebtSchema = z.object({
  creditorName: z.string().min(2, "Creditor name is required"),
  debtType: z.enum(debtTypeValues as [DebtType, ...DebtType[]]),
  interestRate: z.coerce.number().min(0).max(100),
  balance: z.coerce.number().min(0),
  status: z.enum(debtStatusValues as [DebtStatus, ...DebtStatus[]])
});

export const updateDebtSchema = z.object({
  status: z.enum(debtStatusValues as [DebtStatus, ...DebtStatus[]]).optional()
});

export const consultationSchema = z.object({
  assistanceType: z.enum(assistanceTypeValues as [AssistanceType, ...AssistanceType[]]),
  message: z.string().min(10, "Please provide a short description").max(1000)
});

export const pdfPasswordSchema = z.object({
  password: z.string().min(1, "Password is required")
});

const fileMetaSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive()
});

export const ficaVerificationSchema = z.object({
  consentAccepted: z.literal(true, {
    errorMap: () => ({
      message: "You must provide consent to complete FICA verification."
    })
  }),
  useDemoPlaceholder: z.boolean().optional().default(false),
  identityDocument: fileMetaSchema,
  proofOfAddress: fileMetaSchema,
  bankStatement: fileMetaSchema.optional().nullable()
});
