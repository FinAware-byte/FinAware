import { minimumFor, type EssentialCategory, type EssentialItem, type PlanDebt } from "@/lib/budget/plan";

// Cashflow forecast: the account balance, day by day, for the rest of this month and the next
// three — and the first day it would go below zero.
//
// A monthly budget can balance and the account still run dry: debit orders that land before
// payday are paid from what is left of last month. So this works in days, not months. Each debt's
// debit order falls on the day its payments have actually fallen due (from the payment history);
// income arrives on payday, moved to the Friday before when payday is a weekend, as employers do;
// fixed commitments leave on the 1st and day-to-day spending is spread evenly through the month.
//
// It is a projection, not a prediction of what will happen: it assumes this month's figures
// repeat. Every assumption is returned with the result so the page can say it.

export type CashflowEvent = { label: string; amount: number; kind: "income" | "debt" | "fixed" };

export type CashflowDay = { date: Date; balance: number; events: CashflowEvent[] };

export type CashflowMonth = {
  label: string;
  moneyIn: number;
  moneyOut: number;
  closing: number;
  lowest: number;
  lowestDate: Date;
  runsShort: boolean;
};

export type CashflowForecast = {
  days: CashflowDay[];
  lowest: { date: Date; balance: number };
  /** The first day the balance goes below zero, and how long until the next payday from there. */
  firstShort: { date: Date; balance: number; daysToPayday: number | null } | null;
  months: CashflowMonth[];
  paydays: Date[];
  assumptions: string[];
};

export type CashflowInput = {
  today: Date;
  openingBalance: number;
  /** Day of the month income arrives, 1–31. */
  payday: number;
  monthlyIncome: number;
  essentials: EssentialItem[];
  debts: PlanDebt[];
  /** Months after this one to include. */
  monthsAhead?: number;
};

// Paid on a known date rather than spent through the month.
const FIXED: EssentialCategory[] = ["housing", "insurance", "education", "childcare"];

const DEFAULT_DUE_DAY = 1;

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Payday in a given month: clamped to the month's last day, and moved to Friday if it is a weekend. */
export function paydayIn(year: number, month: number, payday: number): Date {
  const date = new Date(year, month, Math.min(payday, daysInMonth(year, month)));
  const weekday = date.getDay();
  if (weekday === 6) date.setDate(date.getDate() - 1);
  if (weekday === 0) date.setDate(date.getDate() - 2);
  return date;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const round = (value: number) => Math.round(value * 100) / 100;

export function forecastCashflow(input: CashflowInput): CashflowForecast {
  const monthsAhead = input.monthsAhead ?? 3;
  const start = new Date(input.today.getFullYear(), input.today.getMonth(), input.today.getDate());
  const end = new Date(start.getFullYear(), start.getMonth() + monthsAhead + 1, 0);

  const fixedMonthly = input.essentials.filter((item) => FIXED.includes(item.category)).reduce((sum, item) => sum + item.amount, 0);
  const dailyMonthly = input.essentials.filter((item) => !FIXED.includes(item.category)).reduce((sum, item) => sum + item.amount, 0);

  // Debts are tracked so one that is paid off inside the window stops being debited.
  const debts = input.debts
    .filter((debt) => debt.balance > 0)
    .map((debt) => ({ debt, remaining: debt.balance, instalment: minimumFor(debt), dueDay: debt.dueDay ?? DEFAULT_DUE_DAY }));

  const paydays: Date[] = [];
  for (let offset = 0; offset <= monthsAhead; offset += 1) {
    const month = new Date(start.getFullYear(), start.getMonth() + offset, 1);
    const payday = paydayIn(month.getFullYear(), month.getMonth(), input.payday);
    if (payday >= start) paydays.push(payday);
  }

  let balance = input.openingBalance;
  const days: CashflowDay[] = [];

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const day = new Date(date);
    const events: CashflowEvent[] = [];
    const monthLength = daysInMonth(day.getFullYear(), day.getMonth());

    if (paydays.some((payday) => sameDay(payday, day)) && input.monthlyIncome > 0) {
      events.push({ label: "Income", amount: input.monthlyIncome, kind: "income" });
    }
    // Fixed commitments leave on the 1st. Today's 1st is already past if the forecast starts later.
    if (day.getDate() === 1 && fixedMonthly > 0) {
      events.push({ label: "Rent and fixed costs", amount: -fixedMonthly, kind: "fixed" });
    }
    for (const item of debts) {
      const dueToday = Math.min(item.dueDay, monthLength) === day.getDate();
      if (!dueToday || item.remaining <= 0) continue;
      const interest = (item.remaining * (item.debt.interestRate / 100)) / 12;
      const payment = Math.min(item.instalment, item.remaining + interest);
      item.remaining = Math.max(0, item.remaining + interest - payment);
      events.push({ label: item.debt.creditor, amount: -round(payment), kind: "debt" });
    }

    const spent = dailyMonthly / monthLength;
    balance = round(balance + events.reduce((sum, event) => sum + event.amount, 0) - spent);
    days.push({ date: day, balance, events });
  }

  const lowestDay = days.reduce((low, day) => (day.balance < low.balance ? day : low), days[0]);
  const shortDay = days.find((day) => day.balance < 0) ?? null;
  const nextPayday = shortDay ? paydays.find((payday) => payday >= shortDay.date) : undefined;

  // Month-by-month summary, reconciled to the daily figures.
  const months: CashflowMonth[] = [];
  let opening = input.openingBalance;
  for (const key of [...new Set(days.map((day) => `${day.date.getFullYear()}-${day.date.getMonth()}`))]) {
    const inMonth = days.filter((day) => `${day.date.getFullYear()}-${day.date.getMonth()}` === key);
    const events = inMonth.flatMap((day) => day.events);
    const moneyIn = round(events.filter((event) => event.amount > 0).reduce((sum, event) => sum + event.amount, 0));
    const closing = inMonth[inMonth.length - 1].balance;
    const low = inMonth.reduce((a, b) => (b.balance < a.balance ? b : a), inMonth[0]);
    months.push({
      label: inMonth[0].date.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }),
      moneyIn,
      // Whatever is not explained by money in is money out — spending included.
      moneyOut: round(moneyIn - (closing - opening)),
      closing,
      lowest: low.balance,
      lowestDate: low.date,
      runsShort: low.balance < 0
    });
    opening = closing;
  }

  const unknownDueDays = input.debts.filter((debt) => debt.balance > 0 && debt.dueDay === undefined).map((debt) => debt.creditor);

  return {
    days,
    lowest: { date: lowestDay.date, balance: lowestDay.balance },
    firstShort: shortDay
      ? {
          date: shortDay.date,
          balance: shortDay.balance,
          daysToPayday: nextPayday ? Math.round((nextPayday.getTime() - shortDay.date.getTime()) / 86_400_000) : null
        }
      : null,
    months,
    paydays,
    assumptions: [
      "Your income and spending stay as they are now.",
      "Pay arrives on your payday, or the Friday before when it falls on a weekend.",
      "Rent, insurance, school and childcare leave on the 1st; everything else is spread evenly through the month.",
      ...(unknownDueDays.length > 0
        ? [`No payment history for ${unknownDueDays.join(", ")}, so its debit order is assumed on the 1st.`]
        : ["Each debit order runs on the day your payments to that account have fallen due before."])
    ]
  };
}
