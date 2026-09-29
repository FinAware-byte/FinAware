import type { EssentialCategory } from "@/lib/budget/plan";

// Bank statement import: a CSV export → the Money Plan's essentials, instead of typing them.
//
// Every South African bank offers a CSV export, but no two lay it out the same way: FNB puts the
// amount before the description, Capitec splits money in and money out, some banks quote every
// field, some use semicolons. So the parser finds the header row by what the columns are called,
// not by position, and reads amounts and dates in the formats banks actually use.
//
// Categorising is by keyword — merchant names and the words banks print — and every transaction
// shows the keyword that placed it, so a wrong guess is visible and can be moved by hand. Money
// that is not an essential living cost is kept out of the essentials on purpose: debt repayments
// are already counted from the Debts page, and transfers and cash withdrawals cannot be traced to
// what they paid for. This runs in the browser; the statement is never uploaded.

export type StatementCategory =
  | EssentialCategory
  | "debt"
  | "transfer"
  | "discretionary"
  | "fees"
  | "unsorted"
  | "income";

export const CATEGORY_LABELS: Record<StatementCategory, string> = {
  housing: "Rent",
  groceries: "Groceries",
  transport: "Transport",
  utilities: "Electricity, water and data",
  healthcare: "Healthcare",
  insurance: "Insurance",
  education: "School or studies",
  childcare: "Childcare or support",
  other: "Other essentials",
  debt: "Debt repayments",
  transfer: "Transfers and cash",
  discretionary: "Not essential",
  fees: "Bank fees",
  unsorted: "Not recognised",
  income: "Money in"
};

export const ESSENTIAL_CATEGORIES: EssentialCategory[] = [
  "housing",
  "groceries",
  "transport",
  "utilities",
  "healthcare",
  "insurance",
  "education",
  "childcare",
  "other"
];

export type Transaction = {
  id: number;
  date: Date;
  description: string;
  /** Negative is money out. */
  amount: number;
};

export type CategorisedTransaction = Transaction & { category: StatementCategory; keyword: string | null };

export type ParsedStatement = {
  transactions: Transaction[];
  /** Rows that looked like transactions but could not be read, for the "skipped" note. */
  skipped: number;
  error: string | null;
};

// ---------------------------------------------------------------------------------------------
// CSV.

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  // Some exports wrap text in single quotes as well ('Date','Amount').
  return cells.map((value) => value.trim().replace(/^'(.*)'$/, "$1").trim());
}

/** "−1 234.56", "1,234.56", "1234,56", "R 1 234.56", "(123.45)", "123.45 DR" → a signed number. */
export function parseMoney(raw: string): number | null {
  let text = raw.trim();
  if (!text) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }
  if (/\bDR$/i.test(text)) {
    sign = -1;
    text = text.replace(/\s*DR$/i, "");
  }
  text = text.replace(/\s*CR$/i, "").replace(/^R\s?/i, "").replace(/[\s ]/g, "");
  if (text.startsWith("-")) {
    sign *= -1;
    text = text.slice(1);
  }
  // A comma followed by exactly two digits at the end is the decimal mark; otherwise commas group thousands.
  text = /,\d{2}$/.test(text) && !/\.\d/.test(text) ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  return sign * Number(text);
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Dates as banks print them. Slashes are read day-first, as in South Africa. */
export function parseDate(raw: string): Date | null {
  const text = raw.trim();
  let match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(text);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = /^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{4})/.exec(text);
  if (match && match[2].toLowerCase() in MONTHS) {
    return new Date(Number(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  }
  return null;
}

type Columns = { date: number; description: number; amount?: number; moneyIn?: number; moneyOut?: number };

function findColumns(cells: string[]): Columns | null {
  const names = cells.map((cell) => cell.toLowerCase());
  const index = (pattern: RegExp) => names.findIndex((name) => pattern.test(name));

  const date = index(/^(transaction |posting |value )?date$|^date/);
  const description = index(/description|details|narrative|transaction$|reference|particulars/);
  const amount = index(/^amount|^transaction amount/);
  const moneyIn = index(/money in|credit|deposit/);
  const moneyOut = index(/money out|debit|withdrawal/);

  if (date < 0 || description < 0) return null;
  if (amount >= 0) return { date, description, amount };
  if (moneyIn >= 0 || moneyOut >= 0) {
    return { date, description, moneyIn: moneyIn >= 0 ? moneyIn : undefined, moneyOut: moneyOut >= 0 ? moneyOut : undefined };
  }
  return null;
}

export function parseStatementCsv(csv: string): ParsedStatement {
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { transactions: [], skipped: 0, error: "The file is empty." };

  const delimiter = (lines.slice(0, 10).join("").match(/;/g)?.length ?? 0) > (lines.slice(0, 10).join("").match(/,/g)?.length ?? 0) ? ";" : ",";

  // Banks put account details above the table, so look for the header in the first rows.
  let headerRow = -1;
  let columns: Columns | null = null;
  for (let row = 0; row < Math.min(lines.length, 30); row += 1) {
    columns = findColumns(splitLine(lines[row], delimiter));
    if (columns) {
      headerRow = row;
      break;
    }
  }
  if (!columns) {
    return {
      transactions: [],
      skipped: 0,
      error: "No header row with a date, a description and an amount (or money in and money out) was found."
    };
  }

  const transactions: Transaction[] = [];
  let skipped = 0;
  for (const line of lines.slice(headerRow + 1)) {
    const cells = splitLine(line, delimiter);
    const date = parseDate(cells[columns.date] ?? "");
    const description = (cells[columns.description] ?? "").replace(/\s+/g, " ").trim();
    let amount: number | null = null;
    if (columns.amount !== undefined) {
      amount = parseMoney(cells[columns.amount] ?? "");
    } else {
      const moneyIn = columns.moneyIn !== undefined ? parseMoney(cells[columns.moneyIn] ?? "") : null;
      const moneyOut = columns.moneyOut !== undefined ? parseMoney(cells[columns.moneyOut] ?? "") : null;
      // Money-out columns are printed as positive or negative depending on the bank.
      if (moneyOut) amount = -Math.abs(moneyOut);
      else if (moneyIn) amount = Math.abs(moneyIn);
      else if (moneyIn === 0 || moneyOut === 0) amount = 0;
    }
    if (!date || amount === null) {
      // Opening-balance and summary lines are expected; count only rows that look like data.
      if (date || amount !== null) skipped += 1;
      continue;
    }
    if (amount === 0) continue;
    transactions.push({ id: transactions.length, date, description, amount });
  }

  return {
    transactions,
    skipped,
    error: transactions.length === 0 ? "The header was found, but no transactions could be read under it." : null
  };
}

// ---------------------------------------------------------------------------------------------
// Categories.

// Order matters: the first match wins, so debt and transfers are checked before the merchants
// they can mention ("WESBANK" is a debt, "CHECKERS" a grocery run, "TRANSFER TO RENT" a transfer
// the user may want to move to housing by hand).
const RULES: Array<{ category: StatementCategory; words: string[] }> = [
  { category: "fees", words: ["service fee", "monthly account fee", "account fee", "sms notification", "notific fee", "bank charges", "cash dep fee", "#fee"] },
  {
    category: "debt",
    words: [
      "home loan", "bond repay", "bond payment", "loan repay", "personal loan", "credit card", "cc payment", "wesbank", "mfc",
      "direct axis", "directaxis", "african bank", "rcs", "edgars acc", "jet acc", "truworths", "foschini", "tfg",
      "mr price money", "lewis stores", "instalment", "installment"
    ]
  },
  {
    category: "transfer",
    words: ["transfer", "trf", "atm", "cash withdrawal", "cash wdl", "send money", "sendmoney", "payshap", "ewallet", "e-wallet", "cash send", "own acc", "to savings"]
  },
  { category: "housing", words: ["rent", "rental", "levy", "levies", "body corporate", "landlord"] },
  {
    category: "groceries",
    words: [
      "checkers", "shoprite", "pick n pay", "picknpay", "pnp", "woolworths", "ww food", "spar", "superspar", "kwikspar",
      "food lovers", "boxer", "usave", "makro", "ok foods", "fruit & veg", "save hyper"
    ]
  },
  {
    category: "transport",
    words: [
      "engen", "shell", "caltex", "sasol", "totalenergies", "total garage", "astron", "bp", "uber trip", "bolt", "gautrain",
      "metrorail", "putco", "taxi", "e-toll", "sanral", "parking", "tollgate", "myciti", "rea vaya", "golden arrow"
    ]
  },
  {
    category: "utilities",
    words: [
      "city of", "municipal", "municipality", "eskom", "electricity", "water bill", "rand water", "vodacom", "mtn", "telkom",
      "cell c", "rain", "afrihost", "vumatel", "openserve", "internet", "airtime", "data bundle"
    ]
  },
  {
    category: "healthcare",
    words: [
      "discovery health", "medshield", "bonitas", "momentum health", "gems", "fedhealth", "bestmed", "clicks", "dis-chem",
      "dischem", "pharmacy", "hospital", "netcare", "mediclinic", "life healthcare", "dentist", "doctor", "optometrist", "specsavers"
    ]
  },
  {
    category: "insurance",
    words: [
      "old mutual", "sanlam", "liberty", "hollard", "outsurance", "santam", "miway", "king price", "budget insurance", "1life",
      "clientele", "assupol", "avbob", "funeral", "insurance", "assurance", "dialdirect", "discovery insure", "discovery life"
    ]
  },
  { category: "childcare", words: ["creche", "crèche", "daycare", "day care", "aftercare", "nanny", "educare"] },
  { category: "education", words: ["school", "college", "university", "unisa", "tuition", "varsity", "tvet", "stationery"] },
  {
    category: "discretionary",
    words: [
      "netflix", "showmax", "dstv", "spotify", "apple.com", "google play", "youtube", "ster-kinekor", "nu metro", "betway",
      "hollywoodbets", "sportingbet", "lotto", "ithuba", "nandos", "nando's", "kfc", "mcdonalds", "mcdonald's", "steers", "spur",
      "debonairs", "wimpy", "uber eats", "mr d", "takealot", "amazon", "superbalist", "sportscene", "totalsports", "liquor",
      "restaurant", "cafe"
    ]
  }
];

// Whole words only: "rent" must not match CURRENT, nor "water" the V&A WATERFRONT.
const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = RULES.map((rule) => ({
  category: rule.category,
  words: rule.words.map((word) => ({ word, pattern: new RegExp(`(^|[^a-z0-9])${escape(word)}($|[^a-z0-9])`, "i") }))
}));

export function categorise(description: string, amount: number): { category: StatementCategory; keyword: string | null } {
  if (amount > 0) return { category: "income", keyword: null };
  for (const rule of MATCHERS) {
    const match = rule.words.find(({ pattern }) => pattern.test(description));
    if (match) return { category: rule.category, keyword: match.word };
  }
  // Not guessed at. Counting it as an essential would inflate the budget; dropping it silently
  // would hide it. It is left out, visibly, until it is given a category.
  return { category: "unsorted", keyword: null };
}

// ---------------------------------------------------------------------------------------------
// Summary.

export type StatementSummary = {
  months: number;
  from: Date;
  to: Date;
  /** Monthly averages, rounded to the rand — ready for the Money Plan's fields. */
  essentials: Record<EssentialCategory, number>;
  essentialsTotal: number;
  /** Monthly averages of what was deliberately left out, and why. */
  leftOut: Array<{ category: StatementCategory; monthly: number; reason: string }>;
  /** Monthly average of money in, for comparison with the income on record. */
  moneyIn: number;
  uncategorised: number;
};

const LEFT_OUT_REASONS: Partial<Record<StatementCategory, string>> = {
  debt: "Already counted from your Debts page, so adding it here would count it twice.",
  transfer: "Transfers and cash could have paid for anything, so they are not guessed at. Move one to a category if you know what it was.",
  discretionary: "Spending that is not an essential. The Money Plan works out what you must pay first.",
  fees: "Bank fees. Worth checking for a cheaper account, but not an essential.",
  unsorted: "Not recognised. Give these a category below, or they stay out of your essentials."
};

/**
 * Months covered, from the first transaction to the last. A statement from 1 to 31 August is one
 * month; from 1 July to 31 August, two. Counting distinct calendar months instead would call a
 * statement from 25 July to 24 August two months and halve every average.
 */
export function monthsCovered(from: Date, to: Date): number {
  const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
  return Math.max(1, Math.round(days / 30.44));
}

export function summariseStatement(transactions: CategorisedTransaction[]): StatementSummary | null {
  if (transactions.length === 0) return null;
  const times = transactions.map((t) => t.date.getTime());
  const from = new Date(Math.min(...times));
  const to = new Date(Math.max(...times));
  const months = monthsCovered(from, to);

  const totals = new Map<StatementCategory, number>();
  for (const transaction of transactions) {
    const out = transaction.amount < 0 ? -transaction.amount : 0;
    if (transaction.category === "income") continue;
    totals.set(transaction.category, (totals.get(transaction.category) ?? 0) + out);
  }

  const monthly = (category: StatementCategory) => Math.round((totals.get(category) ?? 0) / months);
  const essentials = Object.fromEntries(ESSENTIAL_CATEGORIES.map((category) => [category, monthly(category)])) as Record<
    EssentialCategory,
    number
  >;

  return {
    months,
    from,
    to,
    essentials,
    essentialsTotal: ESSENTIAL_CATEGORIES.reduce((sum, category) => sum + essentials[category], 0),
    leftOut: (["unsorted", "debt", "transfer", "discretionary", "fees"] as StatementCategory[])
      .map((category) => ({ category, monthly: monthly(category), reason: LEFT_OUT_REASONS[category] ?? "" }))
      .filter((item) => item.monthly > 0),
    moneyIn: Math.round(transactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0) / months),
    uncategorised: transactions.filter((t) => t.category === "unsorted").length
  };
}
