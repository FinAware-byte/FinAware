import { z } from "zod";
import {
  assistanceTypeValues,
  debtStatusValues,
  debtTypeValues,
  employmentStatusValues,
  type AssistanceType,
  type DebtStatus,
  type DebtType,
  type EmploymentStatus
} from "@/lib/domain";

export const idOrPassportSchema = z
  .string()
  .min(6, "ID/Passport must be at least 6 characters")
  .max(20, "ID/Passport must be 20 characters or fewer")
  .regex(/^[a-zA-Z0-9\-]+$/, "Only letters, numbers, and hyphens are allowed");

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
