import type { EssentialCategory } from "../../lib/budget/plan";

// Demo personas: the seeded people a presenter signs in as, with everything a demo needs that the
// seed does not create — a financial profile, a saved Money Plan, a bank statement and a payslip.
//
// Keyed by SA ID number, which the seed generates deterministically (createRng(20260209)), so the
// same people get the same data after a re-seed. Income, debts and payment history are NOT set
// here: they come from the seed, and every figure below was chosen against them, so each story
// comes out the way it is described. Living costs exclude debt repayments, as the financial
// profile defines them, and the essentials add up to exactly that figure.
//
// Everything here is fictional: the people, employers and account numbers are made up.

export type StatementFormat = "fnb" | "capitec" | "semicolon";

export type Anomaly = { day: number; description: string; amount: number };

export type Persona = {
  idNumber: string;
  slug: string;
  story: string;
  monthlyExpenses: number;
  savings: number;
  financialGoal: string;
  essentials: Partial<Record<EssentialCategory, number>>;
  /** How income arrives on the statement. */
  income:
    | { kind: "salary"; employer: string; payday: number }
    | { kind: "self_employed"; clients: string[] }
    | { kind: "grants"; sources: Array<{ description: string; share: number }> };
  /** Only people with an employer get a payslip. Medical aid is paid by debit order (it shows on the
   *  statement as healthcare), never as a payroll deduction, which would count it twice. */
  payslip?: { employer: string; employeeNumber: string; jobTitle: string; pensionRate: number };
  statement: { format: StatementFormat; bank: string; openingBalance: number; discretionary: Array<{ description: string; amount: number }> };
  /** Unusual spending in the latest (part) month, for the anomaly alerts. */
  septemberAnomalies?: Anomaly[];
};

export const PERSONAS: Persona[] = [
  {
    idNumber: "8211076711246",
    slug: "sibusiso-mthembu",
    story: "Good payer with a bond and a vehicle, wants better rates",
    monthlyExpenses: 28000,
    savings: 15000,
    financialGoal: "Build a 3-month emergency fund",
    essentials: { housing: 2500, groceries: 7000, transport: 5500, utilities: 3500, healthcare: 4500, insurance: 2500, education: 2500 },
    income: { kind: "salary", employer: "ACME HOLDINGS", payday: 25 },
    payslip: { employer: "Acme Holdings (Pty) Ltd", employeeNumber: "AC-10442", jobTitle: "Operations Manager", pensionRate: 0.075 },
    statement: {
      format: "fnb",
      bank: "FNB Gold Cheque",
      openingBalance: 18000,
      discretionary: [
        { description: "NETFLIX.COM", amount: 199 },
        { description: "SPUR STEAK RANCHES", amount: 640 },
        { description: "TAKEALOT.COM", amount: 1150 }
      ]
    }
  },
  {
    idNumber: "8104065756555",
    slug: "thandi-nkosi",
    story: "Missed payments on store accounts and a medical account",
    monthlyExpenses: 7400,
    savings: 1500,
    financialGoal: "Clear my store accounts before December",
    essentials: { housing: 3000, groceries: 2200, transport: 1100, utilities: 600, insurance: 300, other: 200 },
    income: { kind: "salary", employer: "SUNRISE RETAIL", payday: 25 },
    payslip: { employer: "Sunrise Retail (Pty) Ltd", employeeNumber: "SR-2291", jobTitle: "Store Supervisor", pensionRate: 0.05 },
    statement: {
      format: "fnb",
      bank: "FNB Easy Account",
      openingBalance: 900,
      discretionary: [
        { description: "KFC SOWETO", amount: 180 },
        { description: "SHOWMAX", amount: 99 }
      ]
    },
    septemberAnomalies: [
      { day: 9, description: "MEDICLINIC CASUALTY ACCOUNT", amount: 2400 },
      { day: 16, description: "DIS-CHEM PHARMACY", amount: 780 }
    ]
  },
  {
    idNumber: "7007237277999",
    slug: "ayanda-dlamini",
    story: "Garnishee orders on a personal loan and vehicle finance",
    monthlyExpenses: 11800,
    savings: 800,
    financialGoal: "Get the garnishee orders lifted",
    essentials: { housing: 5500, groceries: 3000, transport: 1400, utilities: 900, healthcare: 400, insurance: 400, other: 200 },
    income: { kind: "salary", employer: "METRO LOGISTICS", payday: 25 },
    payslip: { employer: "Metro Logistics (Pty) Ltd", employeeNumber: "ML-7730", jobTitle: "Dispatch Coordinator", pensionRate: 0.06 },
    statement: {
      format: "capitec",
      bank: "Capitec Global One",
      openingBalance: 1200,
      discretionary: [{ description: "DEBONAIRS PIZZA", amount: 220 }]
    }
  },
  {
    idNumber: "7506247168999",
    slug: "lebo-matlala",
    story: "Judgment, summons and garnishee order; self-employed on a small income",
    monthlyExpenses: 5200,
    savings: 0,
    financialGoal: "Stop the summons and keep my business going",
    essentials: { housing: 2200, groceries: 1600, transport: 700, utilities: 400, insurance: 150, other: 150 },
    income: { kind: "self_employed", clients: ["LEBO HAIR STUDIO SALES", "YOCO PAYOUT", "EFT FROM M NTULI"] },
    statement: {
      format: "fnb",
      bank: "FNB Easy Account",
      openingBalance: 400,
      discretionary: [{ description: "CHICKEN LICKEN", amount: 90 }]
    }
  },
  {
    idNumber: "8005258445999",
    slug: "boitumelo-maseko",
    story: "Debt review candidate: seven accounts, repayments of 83% of income",
    monthlyExpenses: 9600,
    savings: 1200,
    financialGoal: "Apply for debt review and keep my car",
    essentials: { housing: 4500, groceries: 2400, transport: 900, utilities: 700, healthcare: 500, insurance: 400, other: 200 },
    income: { kind: "salary", employer: "GAUTENG DEPT OF HEALTH", payday: 15 },
    payslip: { employer: "Gauteng Department of Health", employeeNumber: "PS-558120", jobTitle: "Administrative Officer", pensionRate: 0.075 },
    statement: {
      format: "fnb",
      bank: "FNB Aspire",
      openingBalance: 600,
      discretionary: [
        { description: "BETWAY", amount: 150 },
        { description: "NANDOS", amount: 210 }
      ]
    },
    septemberAnomalies: [
      { day: 6, description: "BETWAY", amount: 400 },
      { day: 12, description: "BETWAY", amount: 650 },
      { day: 17, description: "QUICKCASH LOANS DEBIT ORDER", amount: 1350 },
      { day: 20, description: "HOLLYWOODBETS", amount: 500 }
    ]
  },
  {
    idNumber: "9902207548999",
    slug: "lindiwe-pillay",
    story: "Retrenched, on UIF and a grant, with a summons and a garnishee order",
    monthlyExpenses: 2600,
    savings: 0,
    financialGoal: "Find work and stop the summons",
    essentials: { housing: 1000, groceries: 900, transport: 350, utilities: 250, other: 100 },
    income: {
      kind: "grants",
      sources: [
        { description: "UIF BENEFIT PAYMENT", share: 0.88 },
        { description: "SASSA SRD GRANT", share: 0.12 }
      ]
    },
    statement: { format: "fnb", bank: "FNB Easy Account", openingBalance: 150, discretionary: [] }
  },
  {
    idNumber: "7312147390555",
    slug: "zanele-mkhize",
    story: "Single parent paying child maintenance",
    monthlyExpenses: 9900,
    savings: 3500,
    financialGoal: "Build a 3-month emergency fund",
    essentials: { housing: 3800, groceries: 2800, transport: 900, utilities: 700, education: 800, childcare: 600, insurance: 300 },
    income: { kind: "salary", employer: "UMGENI SCHOOLS", payday: 25 },
    payslip: { employer: "Umgeni Independent Schools", employeeNumber: "US-0187", jobTitle: "Teacher", pensionRate: 0.075 },
    statement: {
      format: "capitec",
      bank: "Capitec Global One",
      openingBalance: 2400,
      discretionary: [{ description: "STEERS", amount: 150 }]
    }
  },
  {
    idNumber: "7312147516555",
    slug: "pieter-van-wyk",
    story: "Small business owner: business loan, overdraft and equipment finance",
    monthlyExpenses: 24000,
    savings: 35000,
    financialGoal: "Clear the overdraft by June",
    essentials: { housing: 9500, groceries: 4500, transport: 3000, utilities: 1800, healthcare: 2200, insurance: 1500, other: 1500 },
    income: { kind: "self_employed", clients: ["INV PAYMENT KAROO BUILDERS", "INV PAYMENT CAPE STEEL", "INV PAYMENT DE WET FARMS"] },
    statement: {
      format: "semicolon",
      bank: "Nedbank Business",
      openingBalance: 21000,
      discretionary: [
        { description: "OCEAN BASKET", amount: 780 },
        { description: "DSTV", amount: 699 }
      ]
    }
  },
  {
    idNumber: "8904189656999",
    slug: "stephan-botha",
    story: "Home loan in arrears, facing repossession",
    monthlyExpenses: 14500,
    savings: 2000,
    financialGoal: "Keep my house out of repossession",
    essentials: { housing: 1200, groceries: 4800, transport: 2600, utilities: 2400, healthcare: 1800, insurance: 1200, other: 500 },
    income: { kind: "salary", employer: "HIGHVELD ENGINEERING", payday: 25 },
    payslip: { employer: "Highveld Engineering (Pty) Ltd", employeeNumber: "HE-3319", jobTitle: "Maintenance Planner", pensionRate: 0.075 },
    statement: {
      format: "fnb",
      bank: "ABSA Cheque Account",
      openingBalance: 1500,
      discretionary: [{ description: "SUPERSPORT UNITED TICKETS", amount: 250 }]
    },
    septemberAnomalies: [{ day: 11, description: "HI-Q TYRES AND REPAIRS", amount: 4200 }]
  },
  {
    idNumber: "7712069592999",
    slug: "mlondi-sithole",
    story: "Unemployed, under pressure from an unregistered lender",
    monthlyExpenses: 2200,
    savings: 0,
    financialGoal: "Deal with the loan shark safely",
    essentials: { housing: 800, groceries: 800, transport: 300, utilities: 200, other: 100 },
    income: {
      kind: "grants",
      sources: [
        { description: "SASSA SRD GRANT", share: 0.15 },
        { description: "EFT FROM T SITHOLE FAMILY SUPPORT", share: 0.85 }
      ]
    },
    statement: { format: "capitec", bank: "Capitec Global One", openingBalance: 120, discretionary: [] },
    septemberAnomalies: [{ day: 14, description: "EASY CASH 4 U DEBIT ORDER", amount: 900 }]
  },
  {
    idNumber: "8611279795187",
    slug: "chantelle-naidoo",
    story: "Three credit cards, never late — optimising balance transfers",
    monthlyExpenses: 21000,
    savings: 60000,
    financialGoal: "Save R30 000 for a car deposit by June",
    essentials: { housing: 9000, groceries: 4000, transport: 3200, utilities: 1600, healthcare: 1400, insurance: 1000, other: 800 },
    income: { kind: "salary", employer: "BLUEWAVE DIGITAL", payday: 25 },
    payslip: { employer: "Bluewave Digital (Pty) Ltd", employeeNumber: "BW-0921", jobTitle: "Product Designer", pensionRate: 0.075 },
    statement: {
      format: "fnb",
      bank: "FNB Premier",
      openingBalance: 32000,
      discretionary: [
        { description: "SPOTIFY", amount: 80 },
        { description: "UBER EATS", amount: 420 },
        { description: "SUPERBALIST", amount: 1350 }
      ]
    }
  },
  {
    idNumber: "6912226070555",
    slug: "kagiso-molefe",
    story: "Personal loan, credit card and overdraft pressure",
    monthlyExpenses: 12400,
    savings: 1000,
    financialGoal: "Consolidate the overdraft and card",
    essentials: { housing: 5200, groceries: 3000, transport: 1800, utilities: 1000, healthcare: 600, insurance: 500, other: 300 },
    income: { kind: "salary", employer: "PRETORIA MOTOR GROUP", payday: 25 },
    payslip: { employer: "Pretoria Motor Group (Pty) Ltd", employeeNumber: "PM-6604", jobTitle: "Sales Consultant", pensionRate: 0.05 },
    statement: {
      format: "fnb",
      bank: "FNB Cheque Account",
      openingBalance: 700,
      discretionary: [
        { description: "WIMPY", amount: 160 },
        { description: "DSTV", amount: 459 }
      ]
    }
  }
];

/** The essentials must add up to the profile's living costs, or the two would disagree on screen. */
export function essentialsTotal(persona: Persona): number {
  return Object.values(persona.essentials).reduce((sum, amount) => sum + (amount ?? 0), 0);
}
