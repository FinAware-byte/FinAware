import { z } from "zod";
import { assistanceTypeValues, debtStatusValues, documentTypeValues, debtTypeValues, employmentStatusValues, passportCountryCodeValues, type AssistanceType, type DebtStatus, type DebtType, type EmploymentStatus, type IdentificationType, type PassportCountry } from "@/lib/domain";
import { isValidPassportForCountry, isValidSouthAfricanId } from "@/lib/identification/rules";
export const idOrPassportSchema = z.string().trim().min(1, "ID/Passport is required");
const documentTypeEnumValues = [...documentTypeValues] as [IdentificationType, ...IdentificationType[]];
const passportCountryEnumValues = [...passportCountryCodeValues] as [PassportCountry, ...PassportCountry[]];
export const authLoginSchema = z.object({
  idNumberOrPassport: idOrPassportSchema,
  documentType: z.enum(documentTypeEnumValues).default("SA_ID"),
  passportCountry: z.enum(passportCountryEnumValues).optional().nullable(),
  password: z.string().min(12, "Password must be at least 12 characters long.").max(128, "Password must be 128 characters or fewer.")
}).superRefine((value, context) => {
  if (value.documentType === "SA_ID" && !isValidSouthAfricanId(value.idNumberOrPassport)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["idNumberOrPassport"], message: "Enter a valid 13-digit South African ID number." });
  }
  if (value.documentType === "PASSPORT") {
    const country = value.passportCountry ?? "OTHER";
    if (!isValidPassportForCountry(value.idNumberOrPassport, country)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["idNumberOrPassport"], message: "Enter a valid passport number for the selected country." });
    }
  }
}).transform((value) => ({
  ...value,
  idNumberOrPassport: value.documentType === "PASSPORT" ? value.idNumberOrPassport.toUpperCase() : value.idNumberOrPassport,
  passportCountry: value.passportCountry ?? null
}));
const identityMoney = z.preprocess((value) => { if (typeof value !== "string") return value; const cleaned = value.replace(/R/gi, "").replace(/[\s,]/g, ""); if (cleaned === "") return undefined; const numeric = Number(cleaned); return Number.isFinite(numeric) ? numeric : value; }, z.number({ required_error: "Monthly income is required", invalid_type_error: "Monthly income must be a valid number" }));
const bankAccountSchema = z.preprocess((value) => (typeof value === "string" ? value.replace(/\D/g, "") : value), z.string().min(6, "Bank account number must contain at least 6 digits").max(20, "Bank account number is too long"));
export const identityUpdateSchema = z.object({ fullName: z.string().trim().min(2, "Full name is required"), bankAccountNumber: bankAccountSchema, monthlyIncome: identityMoney.pipe(z.number().positive("Monthly income must be greater than R0")), employmentStatus: z.enum(employmentStatusValues as [EmploymentStatus, ...EmploymentStatus[]], { required_error: "Employment status is required" }), realAge: z.coerce.number({ required_error: "Real age is required", invalid_type_error: "Real age must be a number" }).int("Real age must be a whole number").min(16, "Real age must be at least 16").max(100, "Real age cannot be greater than 100") });
export const createDebtSchema = z.object({ creditorName: z.string().trim().min(2, "Creditor name is required"), debtType: z.enum(debtTypeValues as [DebtType, ...DebtType[]]), interestRate: z.coerce.number().min(0).max(100), balance: z.coerce.number().min(0), monthlyRepayment: z.coerce.number().positive("Monthly repayment must be greater than R0"), status: z.enum(debtStatusValues as [DebtStatus, ...DebtStatus[]]) });
export const updateDebtSchema = z.object({ status: z.enum(debtStatusValues as [DebtStatus, ...DebtStatus[]]).optional() });
export const consultationSchema = z.object({ assistanceType: z.enum(assistanceTypeValues as [AssistanceType, ...AssistanceType[]]), message: z.string().min(10, "Please provide a short description").max(1000) });
export const pdfPasswordSchema = z.object({ password: z.string().min(1, "Password is required") });
const fileMetaSchema = z.object({ fileName: z.string().min(1), mimeType: z.string().min(1), sizeBytes: z.number().int().positive() });
export const ficaVerificationSchema = z.object({
  termsAccepted: z.literal(true, { errorMap: () => ({ message: "You must accept the FinAware terms and conditions." }) }),
  privacyAccepted: z.literal(true, { errorMap: () => ({ message: "You must consent to the processing of your personal information." }) }),
  useDemoPlaceholder: z.boolean().optional().default(false),
  identityDocument: fileMetaSchema,
  proofOfAddress: fileMetaSchema,
  bankStatement: fileMetaSchema.optional().nullable()
});
