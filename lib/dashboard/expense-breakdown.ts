import type { AppDebt, RiskStatus } from "@/lib/domain";
import { createSeededRandom, hashString, randomInt } from "@/lib/simulation/seed";

export type ExpenseSegment = {
  label: string;
  amount: number;
  share: number;
};

export type BankAccountBreakdown = {
  accountLabel: string;
  bankName: string;
  accountNumberMasked: string;
  incomeAmount: number;
  livingExpenseAmount: number;
  debtExpenseAmount: number;
  totalExpenseAmount: number;
  netAmount: number;
};

const livingSegmentTemplate: Array<{ label: string; weight: number }> = [
  { label: "Housing & Rent", weight: 0.34 },
  { label: "Food & Groceries", weight: 0.19 },
  { label: "Transport", weight: 0.14 },
  { label: "Utilities", weight: 0.09 },
  { label: "Healthcare", weight: 0.07 },
  { label: "Insurance", weight: 0.06 },
  { label: "Education / Family Support", weight: 0.07 },
  { label: "Other Essentials", weight: 0.04 }
];

const bankNames = ["FNB", "ABSA", "Standard Bank", "Nedbank", "Capitec", "TymeBank"];

function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeWeights(weights: number[]): number[] {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights.map(() => 0);
  return weights.map((value) => value / total);
}

function allocateAmount(totalAmount: number, weights: number[]): number[] {
  if (weights.length === 0) return [];

  const normalized = normalizeWeights(weights);
  const amounts = normalized.map((weight, index) => {
    if (index === normalized.length - 1) return 0;
    return roundMoney(totalAmount * weight);
  });

  const allocatedBeforeLast = amounts.reduce((sum, value) => sum + value, 0);
  amounts[normalized.length - 1] = roundMoney(totalAmount - allocatedBeforeLast);
  return amounts;
}

function debtTypeLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function buildLivingExpenseSegments(totalLivingExpenses: number, riskStatus: RiskStatus): ExpenseSegment[] {
  const adjustedTemplate = livingSegmentTemplate.map((segment) => ({ ...segment }));

  if (riskStatus === "HIGH") {
    const insurance = adjustedTemplate.find((segment) => segment.label === "Insurance");
    const utilities = adjustedTemplate.find((segment) => segment.label === "Utilities");
    if (insurance && utilities) {
      insurance.weight -= 0.02;
      utilities.weight += 0.02;
    }
  }

  if (riskStatus === "LOW") {
    const other = adjustedTemplate.find((segment) => segment.label === "Other Essentials");
    const insurance = adjustedTemplate.find((segment) => segment.label === "Insurance");
    if (other && insurance) {
      other.weight -= 0.01;
      insurance.weight += 0.01;
    }
  }

  const amounts = allocateAmount(
    totalLivingExpenses,
    adjustedTemplate.map((segment) => segment.weight)
  );

  return adjustedTemplate
    .map((segment, index) => ({
      label: segment.label,
      amount: amounts[index] ?? 0,
      share: totalLivingExpenses > 0 ? ((amounts[index] ?? 0) / totalLivingExpenses) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);
}

export function buildDebtExpenseSegments(
  debts: Pick<AppDebt, "status" | "debtType" | "monthlyObligation">[]
): ExpenseSegment[] {
  const activeDebts = debts.filter((debt) => debt.status === "ACTIVE");
  const totalDebtExpense = activeDebts.reduce((sum, debt) => sum + debt.monthlyObligation, 0);

  const grouped = activeDebts.reduce<Record<string, number>>((acc, debt) => {
    const key = debtTypeLabel(debt.debtType);
    acc[key] = roundMoney((acc[key] ?? 0) + debt.monthlyObligation);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([label, amount]) => ({
      label,
      amount,
      share: totalDebtExpense > 0 ? (amount / totalDebtExpense) * 100 : 0
    }))
    .sort((a, b) => b.amount - a.amount);
}

function accountMaskFromSeed(bankAccountNumber: string | null, random: () => number, offset: number): string {
  const digits = bankAccountNumber?.replace(/\D/g, "") ?? "";
  if (offset === 0 && digits.length >= 4) {
    return `****${digits.slice(-4)}`;
  }
  const suffix = String(randomInt(1000, 9999, random));
  return `****${suffix}`;
}

export function buildBankAccountBreakdown(input: {
  userSeed: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  livingExpenses: number;
  debtExpenses: number;
}): BankAccountBreakdown[] {
  const seed = hashString(`${input.userSeed}:${input.bankAccountNumber ?? "none"}`);
  const random = createSeededRandom(seed);

  const accountCount = input.monthlyIncome >= 45000 ? 3 : input.monthlyIncome >= 15000 ? 2 : 1;

  // Why: deterministic weights keep account allocation stable across refreshes for the same user.
  const incomeWeights = Array.from({ length: accountCount }).map((_, index) =>
    index === 0 ? random() * 0.4 + 0.45 : random() * 0.35 + 0.2
  );
  const expenseWeights = Array.from({ length: accountCount }).map((_, index) =>
    index === 0 ? random() * 0.4 + 0.5 : random() * 0.3 + 0.15
  );

  const normalizedIncomeWeights = normalizeWeights(incomeWeights);
  const normalizedExpenseWeights = normalizeWeights(expenseWeights);

  const incomeAmounts = allocateAmount(input.monthlyIncome, normalizedIncomeWeights);
  const livingAmounts = allocateAmount(input.livingExpenses, normalizedExpenseWeights);
  const debtAmounts = allocateAmount(input.debtExpenses, normalizedExpenseWeights);

  const accountLabels =
    accountCount === 1
      ? ["Primary Account"]
      : accountCount === 2
        ? ["Primary Account", "Spending Account"]
        : ["Primary Account", "Daily Spend Account", "Savings Wallet"];

  return Array.from({ length: accountCount }).map((_, index) => {
    const livingExpenseAmount = livingAmounts[index] ?? 0;
    const debtExpenseAmount = debtAmounts[index] ?? 0;
    const totalExpenseAmount = roundMoney(livingExpenseAmount + debtExpenseAmount);
    const incomeAmount = incomeAmounts[index] ?? 0;

    return {
      accountLabel: accountLabels[index] ?? `Account ${index + 1}`,
      bankName: bankNames[index % bankNames.length],
      accountNumberMasked: accountMaskFromSeed(input.bankAccountNumber, random, index),
      incomeAmount,
      livingExpenseAmount,
      debtExpenseAmount,
      totalExpenseAmount,
      netAmount: roundMoney(incomeAmount - totalExpenseAmount)
    };
  });
}
