import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { paydayIn } from "../../lib/budget/cashflow";
import type { EssentialCategory } from "../../lib/budget/plan";
import type { Persona } from "./personas";

// Bank statements and payslips for the demo personas, built from the same figures the app holds,
// so what a presenter uploads agrees with what the app already shows. Pure functions: the caller
// passes the person's facts in, and gets text or bytes back.

export type PersonFacts = {
  name: string;
  surname: string;
  idNumber: string;
  age: number;
  /** Take-home pay: the income on the profile, and the net pay on the payslip. */
  monthlyIncome: number;
  debts: Array<{ creditor: string; type: string; monthly: number; status: string; dueDay: number }>;
};

// ---------------------------------------------------------------------------------------------
// Deterministic randomness, so regenerating gives the same files.

function rngFor(text: string): () => number {
  let seed = 2166136261;
  for (const char of text) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cents = (value: number) => Math.round(value * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Statements.

export type StatementLine = { date: Date; description: string; amount: number };

/** The statement runs from 1 June to 28 September 2026: three full months and one in progress. */
export const STATEMENT_START = new Date(2026, 5, 1);
export const STATEMENT_END = new Date(2026, 8, 28);

const GROCERS_LOW = ["SHOPRITE", "BOXER SUPERSTORES", "USAVE", "SPAR"];
const GROCERS_HIGH = ["PICK N PAY", "WOOLWORTHS FOOD", "CHECKERS HYPER", "SPAR"];

function essentialLines(
  category: EssentialCategory,
  monthly: number,
  year: number,
  month: number,
  lastDay: number,
  persona: Persona,
  income: number,
  random: () => number
): StatementLine[] {
  const on = (day: number) => new Date(year, month, Math.min(day, lastDay));
  const vary = (amount: number) => cents(amount * (0.93 + random() * 0.14));
  const monthName = on(1).toLocaleDateString("en-ZA", { month: "long" }).toUpperCase();
  switch (category) {
    case "housing":
      return [
        {
          date: on(1),
          description: persona.slug === "sibusiso-mthembu" || persona.slug === "stephan-botha" ? "BODY CORPORATE LEVY" : `RENT ${monthName} LANDLORD`,
          amount: -monthly
        }
      ];
    case "insurance":
      return [{ date: on(3), description: income > 30000 ? "OUTSURANCE HOME AND CAR INSURANCE" : "OLD MUTUAL FUNERAL COVER", amount: -monthly }];
    case "education":
      return [{ date: on(3), description: "SCHOOL FEES ST MARYS PRIMARY", amount: -monthly }];
    case "childcare":
      return [{ date: on(4), description: "AFTERCARE LITTLE STARS", amount: -monthly }];
    case "healthcare":
      return monthly >= 1000
        ? [
            { date: on(3), description: "DISCOVERY HEALTH MEDICAL SCHEME", amount: -cents(monthly * 0.75) },
            { date: on(18), description: "CLICKS PHARMACY", amount: -vary(monthly * 0.25) }
          ]
        : [
            { date: on(9), description: "CLICKS PHARMACY", amount: -vary(monthly * 0.5) },
            { date: on(21), description: "DIS-CHEM PHARMACY", amount: -vary(monthly * 0.5) }
          ];
    case "utilities":
      return [
        { date: on(2), description: "PREPAID ELECTRICITY", amount: -vary(monthly * 0.25) },
        { date: on(16), description: "PREPAID ELECTRICITY", amount: -vary(monthly * 0.2) },
        { date: on(6), description: "VODACOM AIRTIME AND DATA", amount: -vary(monthly * 0.25) },
        { date: on(7), description: "CITY OF JOHANNESBURG RATES WATER", amount: -vary(monthly * 0.3) }
      ];
    case "groceries": {
      const shops = income > 30000 ? GROCERS_HIGH : GROCERS_LOW;
      const days = [2, 9, 17, 26];
      return days.map((day, index) => ({
        date: on(day),
        description: `${shops[index % shops.length]} ${index % 2 ? "RANDBURG" : "SOWETO"}`,
        amount: -vary(monthly / days.length)
      }));
    }
    case "transport": {
      const days = [4, 11, 18, 25];
      const where = income > 20000 ? ["ENGEN GARAGE N1", "SHELL ULTRA CITY", "ENGEN GARAGE", "SASOL GARAGE"] : ["TAXI FARE TOP-UP", "TAXI FARE TOP-UP", "PUTCO BUS TICKET", "TAXI FARE TOP-UP"];
      return days.map((day, index) => ({ date: on(day), description: where[index], amount: -vary(monthly / days.length) }));
    }
    case "other":
      return [
        { date: on(8), description: "POSTNET COPIES AND COURIER", amount: -vary(monthly * 0.5) },
        { date: on(22), description: "HARDWARE STORE HOUSEHOLD", amount: -vary(monthly * 0.5) }
      ];
  }
}

function debtDescription(debt: PersonFacts["debts"][number]): string {
  const creditor = debt.creditor.toUpperCase();
  if (/credit card/i.test(debt.type)) return `${creditor} CREDIT CARD PAYMENT`;
  return `${creditor} ${debt.type.toUpperCase()} INSTALMENT`;
}

function incomeLines(persona: Persona, income: number, year: number, month: number, lastDay: number, random: () => number): StatementLine[] {
  const on = (day: number) => new Date(year, month, Math.min(day, lastDay));
  if (persona.income.kind === "salary") {
    return [{ date: paydayIn(year, month, persona.income.payday), description: `SALARY ${persona.income.employer}`, amount: income }];
  }
  if (persona.income.kind === "self_employed") {
    // Irregular by nature: three payments whose total swings either side of the average.
    const shares = [0.42, 0.33, 0.25];
    const swing = 0.85 + random() * 0.3;
    return persona.income.clients.map((client, index) => ({
      date: on([5, 14, 24][index]),
      description: client,
      amount: cents(income * shares[index] * swing)
    }));
  }
  return persona.income.sources.map((source, index) => ({
    date: on([1, 10, 20][index % 3]),
    description: source.description,
    amount: cents(income * source.share)
  }));
}

/** Every line of the statement, in date order, with the running balance. */
export function statementLines(persona: Persona, facts: PersonFacts): Array<StatementLine & { balance: number }> {
  const random = rngFor(persona.slug);
  const lines: StatementLine[] = [];
  const bouncedFee = 150;

  for (let month = STATEMENT_START.getMonth(); month <= STATEMENT_END.getMonth(); month += 1) {
    const year = STATEMENT_START.getFullYear();
    const monthEnd = new Date(year, month + 1, 0).getDate();
    const lastDay = month === STATEMENT_END.getMonth() ? STATEMENT_END.getDate() : monthEnd;
    const inMonth = (line: StatementLine) => line.date.getDate() <= lastDay && line.date.getMonth() === month;

    lines.push(...incomeLines(persona, facts.monthlyIncome, year, month, lastDay, random).filter(inMonth));
    for (const [category, amount] of Object.entries(persona.essentials) as Array<[EssentialCategory, number]>) {
      lines.push(...essentialLines(category, amount, year, month, monthEnd, persona, facts.monthlyIncome, random).filter(inMonth));
    }
    // Garnished accounts are deducted from salary before it is paid, so they never reach the
    // account. Everything else is a debit order on the day its payments fall due.
    for (const debt of facts.debts.filter((d) => d.status.toUpperCase() !== "GARNISHED" && d.monthly > 0)) {
      const line = { date: new Date(year, month, Math.min(debt.dueDay, monthEnd)), description: debtDescription(debt), amount: -debt.monthly };
      if (inMonth(line)) lines.push(line);
    }
    for (const item of persona.statement.discretionary) {
      for (const day of [12, 27]) {
        const line = { date: new Date(year, month, day), description: item.description, amount: -cents(item.amount * (0.8 + random() * 0.4)) };
        if (inMonth(line)) lines.push(line);
      }
    }
    const cash = Math.max(100, Math.round((facts.monthlyIncome * 0.03) / 100) * 100);
    const atm = { date: new Date(year, month, 20), description: "ATM WITHDRAWAL", amount: -cash };
    if (inMonth(atm)) lines.push(atm);
    const fee = { date: new Date(year, month, monthEnd), description: "MONTHLY ACCOUNT FEE", amount: facts.monthlyIncome > 40000 ? -250 : -69 };
    if (inMonth(fee)) lines.push(fee);
    if (month === STATEMENT_END.getMonth()) {
      for (const anomaly of persona.septemberAnomalies ?? []) {
        lines.push({ date: new Date(year, month, anomaly.day), description: anomaly.description, amount: -anomaly.amount });
      }
    }
  }

  // Money in first on any day, as banks post it. A debit order the balance cannot cover is
  // returned unpaid and a dishonour fee charged instead: that is how a missed payment looks.
  lines.sort((a, b) => a.date.getTime() - b.date.getTime() || b.amount - a.amount);

  // The statement starts part-way through a pay cycle: rent on 1 June is paid from May's salary,
  // which is still in the account. So the opening balance is topped up by whatever the days
  // before the first money in would otherwise have overdrawn — without it, a statement opened
  // on "-R1 400" before a single transaction had gone wrong.
  const firstIncome = lines.findIndex((line) => line.amount > 0);
  let beforePay = 0;
  let lowest = 0;
  for (const line of lines.slice(0, firstIncome === -1 ? lines.length : firstIncome)) {
    beforePay += line.amount;
    lowest = Math.min(lowest, beforePay);
  }
  let balance = cents(persona.statement.openingBalance - lowest);
  const posted: Array<StatementLine & { balance: number }> = [];
  for (const line of lines) {
    const isDebitOrder = / INSTALMENT$| CREDIT CARD PAYMENT$/.test(line.description);
    if (isDebitOrder && balance + line.amount < 0) {
      balance = cents(balance - bouncedFee);
      posted.push({ date: line.date, description: `DISHONOURED DEBIT ORDER SERVICE FEE ${line.description.replace(/ (INSTALMENT|CREDIT CARD PAYMENT)$/, "")}`, amount: -bouncedFee, balance });
      continue;
    }
    balance = cents(balance + line.amount);
    posted.push({ ...line, balance });
  }
  return posted;
}

const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const slashed = (date: Date) => iso(date).replace(/-/g, "/");
const dmy = (date: Date) => `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
const commaDecimal = (value: number) => value.toFixed(2).replace(".", ",");

/** The statement as a CSV in the persona's bank's layout. */
export function statementCsv(persona: Persona, facts: PersonFacts): string {
  const lines = statementLines(persona, facts);
  const account = `62${facts.idNumber.slice(0, 9)}`;
  if (persona.statement.format === "capitec") {
    return [
      "Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance",
      ...lines.map((line, index) =>
        [
          index + 1,
          account,
          iso(line.date),
          iso(line.date),
          `"${line.description}"`,
          `"${line.description}"`,
          "",
          "",
          line.amount > 0 ? line.amount.toFixed(2) : "",
          line.amount < 0 ? line.amount.toFixed(2) : "",
          "",
          line.balance.toFixed(2)
        ].join(",")
      )
    ].join("\n") + "\n";
  }
  if (persona.statement.format === "semicolon") {
    return [
      `${persona.statement.bank} — ${facts.name} ${facts.surname} (demo data, not a real account)`,
      "Date;Description;Amount;Balance",
      ...lines.map((line) => `${dmy(line.date)};${line.description};${commaDecimal(line.amount)};${commaDecimal(line.balance)}`)
    ].join("\n") + "\n";
  }
  return [
    "ACCOUNT TRANSACTIONS",
    `Account,${persona.statement.bank},${account} (demo data - not a real account)`,
    "Date,Amount,Balance,Description",
    ...lines.map((line) => `${slashed(line.date)},${line.amount.toFixed(2)},${line.balance.toFixed(2)},"${line.description}"`)
  ].join("\n") + "\n";
}

// ---------------------------------------------------------------------------------------------
// Payslips.

// SARS personal income tax, 2025/26 (the tables were not adjusted from 2024/25). Demo payslips
// say which tables they use; they are not tax advice or official documents.
const BRACKETS: Array<[number, number, number]> = [
  // [threshold, base tax, rate above threshold]
  [1_817_000, 644_489, 0.45],
  [857_900, 251_258, 0.41],
  [673_000, 179_147, 0.39],
  [512_800, 121_475, 0.36],
  [370_500, 77_362, 0.31],
  [237_100, 42_678, 0.26],
  [0, 0, 0.18]
];
const REBATES = { primary: 17_235, secondary: 9_444, tertiary: 3_145 };
const UIF_CEILING = 17_712;

export function annualTax(taxable: number, age: number): number {
  const [threshold, base, rate] = BRACKETS.find(([limit]) => taxable > limit) ?? [0, 0, 0.18];
  const tax = base + (taxable - threshold) * rate;
  const rebate = REBATES.primary + (age >= 65 ? REBATES.secondary : 0) + (age >= 75 ? REBATES.tertiary : 0);
  return Math.max(0, tax - rebate);
}

export type Payslip = {
  period: string;
  payDate: Date;
  earnings: Array<{ label: string; amount: number }>;
  deductions: Array<{ label: string; amount: number }>;
  gross: number;
  totalDeductions: number;
  net: number;
};

function deductionsFor(gross: number, age: number, pensionRate: number, garnishees: Array<{ creditor: string; monthly: number }>) {
  const pension = cents(gross * pensionRate);
  const paye = cents(annualTax((gross - pension) * 12, age) / 12);
  const uif = cents(Math.min(gross, UIF_CEILING) * 0.01);
  return [
    { label: "PAYE (income tax)", amount: paye },
    { label: "UIF", amount: uif },
    { label: `Pension fund (${Math.round(pensionRate * 1000) / 10}%)`, amount: pension },
    ...garnishees.map((g) => ({ label: `Emoluments attachment order: ${g.creditor}`, amount: cents(g.monthly) }))
  ];
}

/** The payslip whose net pay is exactly the take-home income FinAware holds for this person. */
export function buildPayslip(persona: Persona, facts: PersonFacts): Payslip | null {
  if (!persona.payslip || persona.income.kind !== "salary") return null;
  const garnishees = facts.debts.filter((d) => d.status.toUpperCase() === "GARNISHED").map((d) => ({ creditor: d.creditor, monthly: d.monthly }));
  const netFor = (gross: number) => gross - deductionsFor(gross, facts.age, persona.payslip!.pensionRate, garnishees).reduce((s, d) => s + d.amount, 0);

  // Net pay rises with gross everywhere, so the gross that produces the right net can be found by halving.
  let low = facts.monthlyIncome;
  let high = facts.monthlyIncome * 3 + garnishees.reduce((s, g) => s + g.monthly, 0) * 2;
  for (let i = 0; i < 80; i += 1) {
    const mid = (low + high) / 2;
    if (netFor(mid) < facts.monthlyIncome) low = mid;
    else high = mid;
  }
  const gross = cents(high);
  const deductions = deductionsFor(gross, facts.age, persona.payslip.pensionRate, garnishees);
  const totalDeductions = cents(deductions.reduce((s, d) => s + d.amount, 0));
  return {
    period: "1 to 30 September 2026",
    payDate: paydayIn(2026, 8, persona.income.payday),
    earnings: [{ label: "Basic salary", amount: gross }],
    deductions,
    gross,
    totalDeductions,
    net: cents(gross - totalDeductions)
  };
}

const rand = (value: number) =>
  `R ${value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/ /g, " ")}`;

export function payslipText(persona: Persona, facts: PersonFacts, slip: Payslip): string {
  const row = (label: string, value: string) => `${label.padEnd(52, ".")} ${value.padStart(14)}`;
  return [
    persona.payslip!.employer.toUpperCase(),
    "PAYSLIP",
    "",
    `Employee:        ${facts.name} ${facts.surname}`,
    `ID number:       ${facts.idNumber}`,
    `Employee number: ${persona.payslip!.employeeNumber}`,
    `Position:        ${persona.payslip!.jobTitle}`,
    `Pay period:      ${slip.period}`,
    `Pay date:        ${slip.payDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`,
    "",
    "EARNINGS",
    ...slip.earnings.map((e) => row(e.label, rand(e.amount))),
    row("Gross pay", rand(slip.gross)),
    "",
    "DEDUCTIONS",
    ...slip.deductions.map((d) => row(d.label, rand(d.amount))),
    row("Total deductions", rand(slip.totalDeductions)),
    "",
    row("NET PAY", rand(slip.net)),
    "",
    "Demo payslip generated by FinAware. The person and employer are fictional. Tax is calculated",
    "on the SARS 2025/26 tables for illustration only; this is not an official document."
  ].join("\n") + "\n";
}

export async function payslipPdf(persona: Persona, facts: PersonFacts, slip: Payslip): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip — ${facts.name} ${facts.surname} — September 2026`);
  doc.setProducer("FinAware demo data");
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.13, 0.2);
  const muted = rgb(0.4, 0.45, 0.52);
  const rule = rgb(0.85, 0.87, 0.9);
  let y = 790;
  const text = (value: string, x: number, size = 10, f = font, color = ink) => page.drawText(value, { x, y, size, font: f, color });
  const right = (value: string, xRight: number, size = 10, f = font) => page.drawText(value, { x: xRight - f.widthOfTextAtSize(value, size), y, size, font: f, color: ink });
  const line = () => page.drawLine({ start: { x: 50, y: y + 8 }, end: { x: 545, y: y + 8 }, thickness: 0.8, color: rule });

  text(persona.payslip!.employer, 50, 16, bold);
  right("PAYSLIP", 545, 16, bold);
  y -= 18;
  text(`Pay period ${slip.period} · paid ${slip.payDate.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}`, 50, 9, font, muted);
  y -= 34;
  for (const [label, value] of [
    ["Employee", `${facts.name} ${facts.surname}`],
    ["ID number", facts.idNumber],
    ["Employee number", persona.payslip!.employeeNumber],
    ["Position", persona.payslip!.jobTitle]
  ]) {
    text(label, 50, 10, font, muted);
    text(value, 170, 10, bold);
    y -= 16;
  }
  y -= 16;
  const section = (title: string, rows: Array<{ label: string; amount: number }>, totalLabel: string, total: number) => {
    text(title, 50, 11, bold);
    y -= 8;
    line();
    y -= 12;
    for (const row of rows) {
      text(row.label, 50);
      right(rand(row.amount), 545);
      y -= 16;
    }
    line();
    y -= 4;
    text(totalLabel, 50, 10, bold);
    right(rand(total), 545, 10, bold);
    y -= 30;
  };
  section("Earnings", slip.earnings, "Gross pay", slip.gross);
  section("Deductions", slip.deductions, "Total deductions", slip.totalDeductions);
  page.drawRectangle({ x: 50, y: y - 10, width: 495, height: 34, color: rgb(0.93, 0.96, 1) });
  y += 2;
  text("Net pay", 62, 13, bold);
  right(rand(slip.net), 533, 13, bold);
  y = 70;
  text("Demo payslip generated by FinAware. The person and employer are fictional. Tax is calculated on the SARS", 50, 8, font, muted);
  y -= 11;
  text("2025/26 tables for illustration only. This is not an official document.", 50, 8, font, muted);
  return doc.save();
}
