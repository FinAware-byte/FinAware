import { prisma } from "../../lib/db/prisma";
import type { EssentialCategory } from "../../lib/budget/plan";
import { monthlyPaymentFor } from "../../lib/finance/repayment";
import { saveBudget, usualDueDay } from "../../lib/microservices/budget-service";
import { upsertFinancialProfile } from "../../lib/microservices/financial-data-service";
import type { PersonFacts } from "./documents";
import { PERSONAS, essentialsTotal, type Persona } from "./personas";

// Applies the demo personas' profiles and Money Plans through the same functions the app's
// services use, so nothing here can be saved in a shape the app would not save itself. Safe to
// run again: both writes replace what is there.

export type AppliedPersona = { persona: Persona; userId: number; facts: PersonFacts };

export async function loadPersonaFacts(persona: Persona): Promise<{ userId: number; facts: PersonFacts } | null> {
  const user = await prisma.users.findFirst({
    where: { id_number: persona.idNumber },
    include: { debts: { include: { payment_history: { select: { due_date: true } } } } }
  });
  if (!user) return null;
  return {
    userId: user.user_id,
    facts: {
      name: user.name,
      surname: user.surname,
      idNumber: user.id_number,
      age: user.real_age,
      monthlyIncome: user.monthly_income,
      debts: user.debts
        .filter((debt) => debt.balance > 0)
        .map((debt) => ({
          creditor: debt.creditor_name,
          type: debt.debt_type,
          // The same repayment the Money Plan and the dashboard show for this debt.
          monthly: Math.round(monthlyPaymentFor({ balance: debt.balance, interestRate: debt.interest_rate, debtType: debt.debt_type }) * 100) / 100,
          status: debt.status,
          dueDay: usualDueDay(debt.payment_history.map((entry) => entry.due_date)) ?? 1
        }))
    }
  };
}

export async function applyDemoProfiles(log: (line: string) => void = () => undefined): Promise<{ applied: AppliedPersona[]; missing: Persona[] }> {
  const applied: AppliedPersona[] = [];
  const missing: Persona[] = [];

  for (const persona of PERSONAS) {
    if (essentialsTotal(persona) !== persona.monthlyExpenses) {
      throw new Error(`${persona.slug}: essentials add up to ${essentialsTotal(persona)}, not the ${persona.monthlyExpenses} living costs`);
    }
    const loaded = await loadPersonaFacts(persona);
    if (!loaded) {
      missing.push(persona);
      continue;
    }

    const profile = await upsertFinancialProfile(String(loaded.userId), {
      monthlyIncome: loaded.facts.monthlyIncome,
      monthlyExpenses: persona.monthlyExpenses,
      savings: persona.savings,
      financialGoal: persona.financialGoal
    });
    if (!profile) throw new Error(`${persona.slug}: the financial profile could not be saved`);

    await saveBudget(
      String(loaded.userId),
      (Object.entries(persona.essentials) as Array<[EssentialCategory, number]>).map(([category, amount]) => ({ category, amount }))
    );
    applied.push({ persona, ...loaded });
    log(`  ${loaded.facts.name} ${loaded.facts.surname}: profile and Money Plan saved`);
  }

  return { applied, missing };
}
