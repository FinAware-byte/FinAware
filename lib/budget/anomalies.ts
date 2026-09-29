import { CATEGORY_LABELS, type CategorisedTransaction, type StatementCategory } from "@/lib/budget/statement";

// Spending anomaly alerts: does the latest month on a statement break this user's own pattern?
//
// The comparison is always against the user's own earlier months, never against other people —
// what is normal for one household is an alarm for another. Two choices keep it honest:
//
// * A month in progress is compared with what was usually spent BY THE SAME DAY in earlier months,
//   not projected to month-end. Projecting "spent so far" linearly calls rent paid on the 1st an
//   overspend every time; comparing like-for-like days does not.
// * A difference must be both proportionally large (half as much again) and large in rands
//   (R500 in a category), so a R40 swing on a R60 habit is not an alert.
//
// Why it matters is the plan: extra spending beyond what the plan leaves spare is money a debit
// order was going to need. The page makes that link; this module only finds the months.

export type SpendingAnomaly = {
  kind: "category" | "total" | "new_payee";
  label: string;
  category?: StatementCategory;
  /** This month, up to `throughDay` when the month is still in progress. */
  amount: number;
  /** The median of earlier complete months, over the same days. */
  usual: number;
  difference: number;
  topTransactions: Array<{ date: Date; description: string; amount: number }>;
};

export type AnomalyReport = {
  month: string | null;
  /** Set when the latest month is still in progress: compared up to this day of the month. */
  throughDay: number | null;
  monthsCompared: number;
  enoughHistory: boolean;
  anomalies: SpendingAnomaly[];
  /**
   * The unusual spending that can be pointed at — flagged categories plus new payees — for the
   * plan check. Not the net total: a grocery shop that falls a few days later than usual makes the
   * net look R1 400 better than the month will end, though the shop is still coming.
   */
  extraThisMonth: number;
};

const CATEGORY_RATIO = 1.5;
const CATEGORY_MIN_RANDS = 500;
const TOTAL_RATIO = 1.2;
const TOTAL_MIN_RANDS = 1000;
const NEW_PAYEE_MIN_RANDS = 200;
const MIN_BASELINE_MONTHS = 2;

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const lastDay = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A payee's name without the reference numbers, dates and month names banks append, so repeats
 * match. Month names matter: "RENT JUNE" and "RENT SEPTEMBER" are the same landlord, and without
 * this every month's rent was a "new payee".
 */
export function payeeOf(description: string): string {
  return description
    .toUpperCase()
    .replace(/[^A-Z&' ]+/g, " ")
    .replace(/\b(POS|PURCHASE|DEBIT|ORDER|PAYMENT|CARD|ACB|EFT|TO|FROM)\b/g, " ")
    .replace(/\b(JAN(UARY)?|FEB(RUARY)?|MAR(CH)?|APR(IL)?|MAY|JUNE?|JULY?|AUG(UST)?|SEPT?(EMBER)?|OCT(OBER)?|NOV(EMBER)?|DEC(EMBER)?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ");
}

const round = (value: number) => Math.round(value * 100) / 100;

export function findSpendingAnomalies(transactions: CategorisedTransaction[]): AnomalyReport {
  const outflows = transactions.filter((t) => t.amount < 0);
  const empty: AnomalyReport = { month: null, throughDay: null, monthsCompared: 0, enoughHistory: false, anomalies: [], extraThisMonth: 0 };
  if (outflows.length === 0) return empty;

  const times = transactions.map((t) => t.date.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));

  // A month counts as complete only if the statement covers it from its first day to its last.
  const keys = [...new Set(outflows.map((t) => monthKey(t.date)))].sort();
  const complete = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const last = new Date(year, month - 1, lastDay(year, month - 1));
    return from <= first && to >= last;
  };

  const latest = keys[keys.length - 1];
  const [latestYear, latestMonth] = latest.split("-").map(Number);
  const latestComplete = complete(latest);
  const throughDay = latestComplete ? null : to.getDate();
  const baseline = keys.filter((key) => key !== latest && complete(key));
  const monthLabel = new Date(latestYear, latestMonth - 1, 1).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });

  if (baseline.length < MIN_BASELINE_MONTHS) {
    return { ...empty, month: monthLabel, throughDay, monthsCompared: baseline.length };
  }

  // Like for like: in a month still in progress, only the same days of earlier months count.
  const inWindow = (t: CategorisedTransaction) => throughDay === null || t.date.getDate() <= throughDay;
  const spend = (key: string, filter: (t: CategorisedTransaction) => boolean) =>
    outflows.filter((t) => monthKey(t.date) === key && inWindow(t) && filter(t)).reduce((sum, t) => sum - t.amount, 0);

  const anomalies: SpendingAnomaly[] = [];
  const categories = [...new Set(outflows.map((t) => t.category))].filter((category) => category !== "debt" && category !== "income");

  for (const category of categories) {
    const amount = round(spend(latest, (t) => t.category === category));
    const usual = round(median(baseline.map((key) => spend(key, (t) => t.category === category))));
    if (amount >= usual * CATEGORY_RATIO && amount - usual >= CATEGORY_MIN_RANDS) {
      anomalies.push({
        kind: "category",
        label: CATEGORY_LABELS[category],
        category,
        amount,
        usual,
        difference: round(amount - usual),
        topTransactions: outflows
          .filter((t) => monthKey(t.date) === latest && inWindow(t) && t.category === category)
          .sort((a, b) => a.amount - b.amount)
          .slice(0, 3)
          .map((t) => ({ date: t.date, description: t.description, amount: -t.amount }))
      });
    }
  }

  // Debt repayments are fixed and already planned for, so they are left out of "everything".
  const notDebt = (t: CategorisedTransaction) => t.category !== "debt";
  const total = round(spend(latest, notDebt));
  const usualTotal = round(median(baseline.map((key) => spend(key, notDebt))));
  if (total >= usualTotal * TOTAL_RATIO && total - usualTotal >= TOTAL_MIN_RANDS) {
    anomalies.unshift({ kind: "total", label: "Everything you spent", amount: total, usual: usualTotal, difference: round(total - usualTotal), topTransactions: [] });
  }

  // New payees: a name never seen in the earlier months, for a meaningful amount. A new debit
  // order is how an unaffordable subscription, loan or scam first shows up.
  const seen = new Set(outflows.filter((t) => monthKey(t.date) !== latest).map((t) => payeeOf(t.description)));
  const fresh = new Map<string, CategorisedTransaction[]>();
  for (const t of outflows.filter((t) => monthKey(t.date) === latest && t.category !== "transfer")) {
    const payee = payeeOf(t.description);
    if (!payee || seen.has(payee)) continue;
    fresh.set(payee, [...(fresh.get(payee) ?? []), t]);
  }
  for (const [payee, items] of fresh) {
    const amount = round(items.reduce((sum, t) => sum - t.amount, 0));
    if (amount < NEW_PAYEE_MIN_RANDS) continue;
    anomalies.push({
      kind: "new_payee",
      label: `New payee: ${payee}`,
      category: items[0].category,
      amount,
      usual: 0,
      difference: amount,
      topTransactions: items.slice(0, 3).map((t) => ({ date: t.date, description: t.description, amount: -t.amount }))
    });
  }

  // A new payee inside an already-flagged category is part of that category's difference.
  const flagged = new Set(anomalies.filter((a) => a.kind === "category").map((a) => a.category));
  const extraThisMonth = round(
    anomalies
      .filter((a) => a.kind === "category" || (a.kind === "new_payee" && !flagged.has(a.category)))
      .reduce((sum, a) => sum + a.difference, 0)
  );

  return { month: monthLabel, throughDay, monthsCompared: baseline.length, enoughHistory: true, anomalies, extraThisMonth };
}
