import { prisma } from "@/lib/db/prisma";
import type { EssentialCategory, EssentialItem, PlanDebt } from "@/lib/budget/plan";

// Budget data access, owned by the Financial Data Service like every other table.
// Budget_Item is new and written only here; existing tables stay read-only.

export type BudgetBundle = {
  essentials: EssentialItem[];
  monthlyIncome: number;
  savings: number | null;
  creditScore: number;
  debts: PlanDebt[];
};

function parseUserId(value: string): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function getBudgetBundle(userId: string): Promise<BudgetBundle | null> {
  const id = parseUserId(userId);
  if (!id) return null;

  const user = await prisma.users.findUnique({
    where: { user_id: id },
    include: {
      credit_profile: true,
      financial_profile: true,
      budget_items: { orderBy: { category: "asc" } },
      debts: { orderBy: { balance: "desc" }, include: { payment_history: { select: { due_date: true } } } }
    }
  });
  if (!user) return null;

  return {
    essentials: user.budget_items.map((item) => ({
      category: item.category as EssentialCategory,
      amount: item.amount
    })),
    monthlyIncome: user.monthly_income,
    // Savings live on the ML financial profile. Null (not zero) when the user has not entered
    // them, so the plan can say the buffer is unknown instead of assuming they have nothing.
    savings: user.financial_profile?.savings ?? null,
    creditScore: Math.min(850, Math.max(300, user.credit_profile?.credit_score ?? 600)),
    // Every status the app has (Active, Re-considered, Garnished) is an outstanding debt, so the
    // only thing that removes a debt from the plan is a cleared balance.
    debts: user.debts
      .filter((debt) => debt.balance > 0)
      .map((debt) => ({
        debtId: debt.debt_id,
        creditor: debt.creditor_name,
        balance: debt.balance,
        interestRate: debt.interest_rate,
        // The raw stored type, not the normalised enum: the money plan matches on the words the
        // app actually stores ("Bond", "Vehicle Finance"), and toDebtType() maps most of them to
        // OTHER, which would lose exactly the distinction the repayment rules need.
        debtType: debt.debt_type,
        dueDay: usualDueDay(debt.payment_history.map((entry) => entry.due_date))
      }))
  };
}

/**
 * The day of the month a debt's payments usually fall due. Read in South African time (UTC+2, no
 * daylight saving): due dates are stored as UTC midnight-in-SAST, so reading them in UTC — as a
 * container would — puts every debit order a day early.
 */
export function usualDueDay(dueDates: Date[]): number | undefined {
  if (dueDates.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const date of dueDates) {
    const day = new Date(date.getTime() + 2 * 60 * 60 * 1000).getUTCDate();
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/** Replaces the whole budget: categories left out are removed, so the UI can delete a line. */
export async function saveBudget(userId: string, essentials: EssentialItem[]): Promise<EssentialItem[] | null> {
  const id = parseUserId(userId);
  if (!id) return null;

  const user = await prisma.users.findUnique({ where: { user_id: id }, select: { user_id: true } });
  if (!user) return null;

  const keep = essentials.filter((item) => item.amount > 0);

  await prisma.$transaction([
    prisma.budgetItem.deleteMany({
      where: { user_id: id, category: { notIn: keep.map((item) => item.category) } }
    }),
    ...keep.map((item) =>
      prisma.budgetItem.upsert({
        where: { user_id_category: { user_id: id, category: item.category } },
        create: { user_id: id, category: item.category, amount: item.amount },
        update: { amount: item.amount }
      })
    )
  ]);

  return keep;
}
