import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const PROVIDER_WHATSAPP_NUMBER = "27670298265";

type RiskLevel = "High" | "Medium" | "Low";
type DebtStatus = "Active" | "Re-considered" | "Garnished";
type AdvisorType = "Financial" | "Debt" | "Legal";
type EmploymentStatus =
  | "Employed"
  | "Unemployed"
  | "Self-Employed"
  | "Student"
  | "Pensioner";
type WealthSegment = "STANDARD" | "RICH" | "ECONOMY_MOVER" | "SUPER_RICH";

type WealthAssetSeed = {
  assetType: "Shares" | "Company Equity" | "Residential House" | "Commercial House";
  assetName: string;
  estimatedValue: number;
  ownershipPercentage?: number;
};

type DebtBlueprint = {
  creditorName: string;
  debtType: string;
  balanceRange: [number, number];
  interestRange: [number, number];
  preferredStatus?: DebtStatus;
};

type Scenario = {
  title: string;
  risk: RiskLevel;
  name: string;
  surname: string;
  employmentStatus: EmploymentStatus;
  incomeRange: [number, number];
  debtCountRange: [number, number];
  requiredDebts: DebtBlueprint[];
  expertMessages: string[];
  legalRecordHints?: string[];
};

type CreatedDebt = {
  debtId: number;
  creditorName: string;
  debtType: string;
  balance: number;
  interestRate: number;
  status: DebtStatus;
};

type PaymentRow = {
  debt_id: number;
  due_date: Date;
  paid: boolean;
  missed: boolean;
};

type WealthProfile = {
  tier: Exclude<WealthSegment, "STANDARD">;
  name: string;
  surname: string;
  risk: RiskLevel;
  employmentStatus: EmploymentStatus;
  monthlyIncome: number;
  realAge: number;
  estimatedNetWorth: number;
  assets: WealthAssetSeed[];
  debts: Array<{
    creditorName: string;
    debtType: string;
    balance: number;
    interestRate: number;
    status: DebtStatus;
  }>;
  advisorMessage: string;
};

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, rng: () => number): number {
  return Number((rng() * (max - min) + min).toFixed(2));
}

function pickOne<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function luhnCheck(numericValue: string): boolean {
  let sum = 0;
  let shouldDouble = false;

  for (let i = numericValue.length - 1; i >= 0; i -= 1) {
    let digit = Number(numericValue[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidSouthAfricanId(idNumber: string): boolean {
  if (!/^[0-9]{13}$/.test(idNumber)) return false;
  const yy = Number(idNumber.slice(0, 2));
  const month = Number(idNumber.slice(2, 4));
  const day = Number(idNumber.slice(4, 6));
  const validDob =
    validCalendarDate(1900 + yy, month, day) || validCalendarDate(2000 + yy, month, day);
  if (!validDob) return false;
  return luhnCheck(idNumber);
}

function computeLuhnCheckDigit(prefix12: string): number {
  for (let digit = 0; digit <= 9; digit += 1) {
    if (luhnCheck(`${prefix12}${digit}`)) return digit;
  }
  throw new Error("Unable to compute Luhn check digit");
}

// Required helper: suffix-based risk rule.
function riskFromId(idNumber: string): RiskLevel {
  if (idNumber.endsWith("999")) return "High";
  if (idNumber.endsWith("555")) return "Medium";
  return "Low";
}

// Required helper: score by risk range.
function creditScoreForRisk(risk: RiskLevel, rng: () => number): number {
  if (risk === "Low") return randomInt(740, 820, rng);
  if (risk === "Medium") return randomInt(620, 739, rng);
  return randomInt(300, 619, rng);
}

// Required helper: monthly due dates for 6-12 month history.
function generateDueDates(monthCount: number, endDate = new Date()): Date[] {
  const dates: Date[] = [];
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    dates.push(new Date(endDate.getFullYear(), endDate.getMonth() - i, 25));
  }
  return dates;
}

// Required helper: monthly obligation estimate to store in Credit_Profile.
function monthlyObligationEstimator(debtType: string, balance: number): number {
  const kind = debtType.toLowerCase();

  let factor = 0.05;
  let minimum = 400;

  if (kind.includes("bond") || kind.includes("mortgage") || kind.includes("home loan")) {
    factor = 0.008;
    minimum = 2200;
  } else if (kind.includes("vehicle") || kind.includes("equipment finance")) {
    factor = 0.02;
    minimum = 1600;
  } else if (kind.includes("credit card") || kind.includes("store")) {
    factor = 0.08;
    minimum = 250;
  } else if (kind.includes("personal loan") || kind.includes("business loan")) {
    factor = 0.05;
    minimum = 700;
  } else if (kind.includes("overdraft") || kind.includes("telecom") || kind.includes("utility") || kind.includes("municipality") || kind.includes("city power")) {
    factor = 0.1;
    minimum = 220;
  } else if (kind.includes("student") || kind.includes("nsfas")) {
    factor = 0.03;
    minimum = 300;
  } else if (kind.includes("medical")) {
    factor = 0.06;
    minimum = 450;
  } else if (kind.includes("maintenance")) {
    factor = 0.12;
    minimum = 1200;
  } else if (kind.includes("funeral")) {
    factor = 0.06;
    minimum = 180;
  } else if (kind.includes("unregistered") || kind.includes("informal")) {
    factor = 0.12;
    minimum = 500;
  }

  return roundCurrency(Math.max(minimum, balance * factor));
}

function seedDobPrefix(index: number): string {
  const year = 1960 + ((index * 7) % 40);
  const month = ((index * 5) % 12) + 1;
  const day = ((index * 11) % 28) + 1;
  return `${String(year).slice(2)}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function generateIdNumber(index: number, risk: RiskLevel, usedIds: Set<string>): string {
  const lowSuffixes = ["123", "321", "741", "864", "432", "678", "246", "808", "187", "654"];
  const targetSuffixes = risk === "High" ? ["999"] : risk === "Medium" ? ["555"] : lowSuffixes;

  for (let attempt = 0; attempt < 25000; attempt += 1) {
    const suffix = targetSuffixes[(index + attempt) % targetSuffixes.length];
    const dobPrefix = seedDobPrefix(index + attempt);
    const sequence = String(((index + 31) * 173 + attempt * 47) % 10000).padStart(4, "0");
    const prefix12 = `${dobPrefix}${sequence}${suffix.slice(0, 2)}`;
    const expectedCheckDigit = Number(suffix[2]);
    const computedCheckDigit = computeLuhnCheckDigit(prefix12);
    if (computedCheckDigit !== expectedCheckDigit) continue;

    const idNumber = `${prefix12}${computedCheckDigit}`;
    if (!isValidSouthAfricanId(idNumber)) continue;
    if (riskFromId(idNumber) !== risk) continue;
    if (usedIds.has(idNumber)) continue;

    usedIds.add(idNumber);
    return idNumber;
  }

  throw new Error(`Failed to generate valid ID for risk ${risk} at index ${index}`);
}

function assertSeedIdValidity(idNumber: string, expectedRisk: RiskLevel): void {
  if (!/^[0-9]{13}$/.test(idNumber)) {
    throw new Error(`Seed ID must be exactly 13 digits: ${idNumber}`);
  }
  if (!isValidSouthAfricanId(idNumber)) {
    throw new Error(`Seed ID failed SA validation checks: ${idNumber}`);
  }
  const derivedRisk = riskFromId(idNumber);
  if (derivedRisk !== expectedRisk) {
    throw new Error(`Risk mismatch for generated id ${idNumber}. Expected ${expectedRisk}, got ${derivedRisk}.`);
  }
}

function debtTemplate(
  creditorName: string,
  debtType: string,
  balanceMin: number,
  balanceMax: number,
  interestMin: number,
  interestMax: number,
  preferredStatus?: DebtStatus
): DebtBlueprint {
  return {
    creditorName,
    debtType,
    balanceRange: [balanceMin, balanceMax],
    interestRange: [interestMin, interestMax],
    preferredStatus
  };
}

const debtTemplatePool: DebtBlueprint[] = [
  debtTemplate("FNB", "Credit Card", 6000, 90000, 14.5, 25.5),
  debtTemplate("ABSA", "Personal Loan", 12000, 240000, 15.5, 28.5),
  debtTemplate("Standard Bank", "Overdraft", 2500, 85000, 12.5, 24.0),
  debtTemplate("Nedbank", "Credit Card", 5000, 120000, 14.0, 25.0),
  debtTemplate("Capitec", "Personal Loan", 8000, 120000, 17.0, 29.0),
  debtTemplate("TymeBank", "Personal Loan", 5000, 90000, 17.0, 28.0),
  debtTemplate("African Bank", "Personal Loan", 9000, 150000, 18.0, 30.0),
  debtTemplate("Old Mutual Finance", "Personal Loan", 10000, 180000, 16.0, 28.0),
  debtTemplate("WesBank", "Vehicle Finance", 70000, 580000, 9.5, 15.5),
  debtTemplate("MFC", "Vehicle Finance", 65000, 450000, 9.2, 15.0),
  debtTemplate("Toyota Financial Services", "Vehicle Finance", 110000, 520000, 9.0, 14.5),
  debtTemplate("Woolworths", "Store Card", 1200, 30000, 16.5, 27.5),
  debtTemplate("Truworths", "Store Card", 900, 26000, 16.5, 28.0),
  debtTemplate("Edgars", "Store Card", 900, 25000, 16.5, 28.0),
  debtTemplate("Mr Price", "Store Card", 700, 18000, 16.0, 27.5),
  debtTemplate("TFG", "Store Card", 1300, 35000, 16.5, 28.0),
  debtTemplate("Jet", "Store Card", 600, 12000, 16.0, 27.0),
  debtTemplate("PEP", "Store Card", 300, 7000, 15.5, 26.0),
  debtTemplate("Ackermans", "Store Card", 350, 8000, 15.5, 26.0),
  debtTemplate("NSFAS", "Student Loan", 18000, 350000, 0.0, 8.0),
  debtTemplate("Telkom", "Telecom Arrears", 500, 16000, 0.0, 5.0),
  debtTemplate("Vodacom", "Telecom Arrears", 500, 14000, 0.0, 5.0),
  debtTemplate("MTN", "Telecom Arrears", 500, 15000, 0.0, 5.0),
  debtTemplate("Municipality Arrears", "Utility Arrears", 1200, 60000, 0.0, 4.5),
  debtTemplate("City Power", "Utility Arrears", 900, 40000, 0.0, 4.5),
  debtTemplate("Netcare", "Medical Account", 3000, 110000, 0.0, 8.5),
  debtTemplate("Mediclinic", "Medical Account", 2500, 100000, 0.0, 8.5),
  debtTemplate("Maintenance Order (Family Court)", "Child Maintenance", 1500, 45000, 0.0, 0.0),
  debtTemplate("Funeral Policy", "Funeral Policy", 900, 18000, 0.0, 6.0),
  debtTemplate("Unregistered lender", "Informal Loan", 3000, 70000, 18.0, 48.0)
];

const mandatoryScenarios: Scenario[] = [
  {
    title: "Bond + vehicle (good payer) wants better rates",
    risk: "Low",
    name: "Sibusiso",
    surname: "Mthembu",
    employmentStatus: "Employed",
    incomeRange: [42000, 78000],
    debtCountRange: [2, 3],
    requiredDebts: [
      debtTemplate("FNB", "Bond", 950000, 2200000, 8.1, 11.6, "Active"),
      debtTemplate("WesBank", "Vehicle Finance", 120000, 450000, 9.5, 14.5, "Active")
    ],
    expertMessages: [
      "I want to improve my affordability profile and negotiate lower rates on my bond and vehicle finance."
    ]
  },
  {
    title: "Store accounts (Woolworths/TFG/etc) missed payments",
    risk: "Medium",
    name: "Thandi",
    surname: "Nkosi",
    employmentStatus: "Employed",
    incomeRange: [12000, 26000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Woolworths", "Store Card", 2500, 22000, 18.0, 27.0),
      debtTemplate("TFG", "Store Card", 1800, 24000, 18.0, 27.5),
      debtTemplate("Mr Price", "Store Card", 1400, 16000, 17.0, 26.5)
    ],
    expertMessages: [
      "My store accounts are in arrears and I need a realistic repayment sequence to recover my score."
    ]
  },
  {
    title: "Personal loan + credit card + overdraft pressure",
    risk: "Medium",
    name: "Kagiso",
    surname: "Molefe",
    employmentStatus: "Employed",
    incomeRange: [18000, 36000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("ABSA", "Personal Loan", 25000, 180000, 17.0, 29.0),
      debtTemplate("FNB", "Credit Card", 8000, 98000, 16.5, 26.0),
      debtTemplate("Standard Bank", "Overdraft", 3500, 60000, 13.0, 24.0)
    ],
    expertMessages: [
      "I am under pressure from a personal loan, card and overdraft. I need a debt avalanche plan."
    ]
  },
  {
    title: "Garnishee order from unsecured credit",
    risk: "High",
    name: "Ayanda",
    surname: "Dlamini",
    employmentStatus: "Employed",
    incomeRange: [9000, 24000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("African Bank", "Personal Loan", 30000, 180000, 20.0, 30.0, "Garnished"),
      debtTemplate("Capitec", "Credit Card", 7000, 65000, 18.0, 28.0)
    ],
    legalRecordHints: ["Garnishee order"],
    expertMessages: [
      "My salary has a garnishee deduction. I need urgent legal and debt counselling support."
    ]
  },
  {
    title: "Legal judgment + multiple defaults",
    risk: "High",
    name: "Lebo",
    surname: "Matlala",
    employmentStatus: "Self-Employed",
    incomeRange: [5000, 20000],
    debtCountRange: [5, 8],
    requiredDebts: [
      debtTemplate("Old Mutual Finance", "Personal Loan", 40000, 220000, 18.0, 29.0, "Re-considered"),
      debtTemplate("Nedbank", "Credit Card", 12000, 100000, 17.0, 28.0, "Garnished")
    ],
    legalRecordHints: ["Judgment", "Summons"],
    expertMessages: [
      "I have a legal judgment and multiple defaults. Please help me with a formal rehabilitation path."
    ]
  },
  {
    title: "NSFAS + part-time income + store debt",
    risk: "Medium",
    name: "Nomfundo",
    surname: "Cele",
    employmentStatus: "Student",
    incomeRange: [2500, 9000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("NSFAS", "Student Loan", 30000, 190000, 0.0, 6.0),
      debtTemplate("Truworths", "Store Card", 800, 12000, 17.0, 27.0)
    ],
    expertMessages: [
      "I am a student with part-time income and NSFAS plus store debt. I need a workable monthly plan."
    ]
  },
  {
    title: "Government employee stable payslip but high utilization",
    risk: "Medium",
    name: "Mpho",
    surname: "Radebe",
    employmentStatus: "Employed",
    incomeRange: [24000, 42000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("FNB", "Credit Card", 25000, 120000, 16.0, 25.0),
      debtTemplate("ABSA", "Personal Loan", 18000, 170000, 16.5, 28.0)
    ],
    expertMessages: [
      "My income is stable but credit utilization is too high. I need utilization reduction targets."
    ]
  },
  {
    title: "Gig worker (Bolt/contractor) income volatility",
    risk: "Medium",
    name: "Tebogo",
    surname: "Sekgobela",
    employmentStatus: "Self-Employed",
    incomeRange: [7000, 28000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Capitec", "Personal Loan", 12000, 100000, 18.0, 29.0),
      debtTemplate("MFC", "Vehicle Finance", 60000, 350000, 10.0, 15.0)
    ],
    expertMessages: [
      "My contracting income changes every month. I need a repayment strategy that handles volatility."
    ]
  },
  {
    title: "Single parent with maintenance obligations",
    risk: "Medium",
    name: "Zanele",
    surname: "Mkhize",
    employmentStatus: "Employed",
    incomeRange: [10000, 26000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Maintenance Order (Family Court)", "Child Maintenance", 5000, 45000, 0.0, 0.0),
      debtTemplate("Woolworths", "Store Card", 1200, 14000, 17.0, 27.0)
    ],
    expertMessages: [
      "I support children and need a debt plan that protects maintenance commitments."
    ]
  },
  {
    title: "Small business owner: business loan + overdraft + equipment finance",
    risk: "Medium",
    name: "Pieter",
    surname: "Van Wyk",
    employmentStatus: "Self-Employed",
    incomeRange: [22000, 95000],
    debtCountRange: [3, 6],
    requiredDebts: [
      debtTemplate("Nedbank", "Business Loan", 55000, 480000, 13.0, 22.0),
      debtTemplate("Standard Bank", "Overdraft", 15000, 180000, 12.0, 22.0),
      debtTemplate("ABSA", "Equipment Finance", 45000, 320000, 10.0, 18.0)
    ],
    expertMessages: [
      "I need to balance business debt servicing with personal affordability and improve my profile."
    ]
  },
  {
    title: "Retrenchment/unemployed debt spiral",
    risk: "High",
    name: "Lindiwe",
    surname: "Pillay",
    employmentStatus: "Unemployed",
    incomeRange: [0, 6000],
    debtCountRange: [5, 8],
    requiredDebts: [
      debtTemplate("Old Mutual Finance", "Personal Loan", 35000, 220000, 18.0, 30.0, "Re-considered"),
      debtTemplate("Municipality Arrears", "Utility Arrears", 5000, 60000, 0.0, 5.0)
    ],
    legalRecordHints: ["Summons"],
    expertMessages: [
      "After retrenchment I am in arrears across accounts and need urgent intervention."
    ]
  },
  {
    title: "Pensioner/near-retirement restructure",
    risk: "Medium",
    name: "Johannes",
    surname: "Mokoena",
    employmentStatus: "Pensioner",
    incomeRange: [6000, 22000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("African Bank", "Personal Loan", 18000, 120000, 16.0, 28.0),
      debtTemplate("Netcare", "Medical Account", 3000, 65000, 0.0, 8.0)
    ],
    expertMessages: [
      "I am close to retirement and need repayment restructuring aligned to pension income."
    ]
  },
  {
    title: "Medical shortfall + loans",
    risk: "Medium",
    name: "Nokuthula",
    surname: "Ndlovu",
    employmentStatus: "Employed",
    incomeRange: [14000, 34000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Mediclinic", "Medical Account", 6000, 90000, 0.0, 8.0),
      debtTemplate("Capitec", "Personal Loan", 12000, 160000, 17.0, 29.0)
    ],
    expertMessages: [
      "Unexpected medical costs increased my debt. I need a realistic payoff plan."
    ]
  },
  {
    title: "Extended family support pressure",
    risk: "Medium",
    name: "Tshepo",
    surname: "Mabaso",
    employmentStatus: "Employed",
    incomeRange: [11000, 28000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("FNB", "Credit Card", 9000, 70000, 15.0, 25.0),
      debtTemplate("Municipality Arrears", "Utility Arrears", 2000, 35000, 0.0, 4.5)
    ],
    expertMessages: [
      "Family support costs are high and I need help balancing obligations without defaulting."
    ]
  },
  {
    title: "Renter heavy unsecured debt",
    risk: "High",
    name: "Karabo",
    surname: "Motsamai",
    employmentStatus: "Employed",
    incomeRange: [10000, 26000],
    debtCountRange: [4, 8],
    requiredDebts: [
      debtTemplate("ABSA", "Credit Card", 10000, 90000, 16.0, 27.0),
      debtTemplate("Old Mutual Finance", "Personal Loan", 22000, 180000, 17.0, 29.0),
      debtTemplate("City Power", "Utility Arrears", 2000, 28000, 0.0, 4.5)
    ],
    legalRecordHints: ["Judgment"],
    expertMessages: [
      "I rent and carry too much unsecured debt. I need urgent debt consolidation guidance."
    ]
  },
  {
    title: "High income but poor discipline",
    risk: "High",
    name: "Amukelani",
    surname: "Khoza",
    employmentStatus: "Employed",
    incomeRange: [65000, 140000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("FNB", "Credit Card", 30000, 180000, 15.0, 24.0),
      debtTemplate("Nedbank", "Personal Loan", 30000, 220000, 14.0, 23.0),
      debtTemplate("WesBank", "Vehicle Finance", 180000, 650000, 9.0, 14.5)
    ],
    expertMessages: [
      "My income is high but overspending keeps utilization and arrears high."
    ]
  },
  {
    title: "Debt review candidate",
    risk: "High",
    name: "Boitumelo",
    surname: "Maseko",
    employmentStatus: "Employed",
    incomeRange: [8000, 24000],
    debtCountRange: [5, 8],
    requiredDebts: [
      debtTemplate("African Bank", "Personal Loan", 25000, 160000, 18.0, 30.0, "Re-considered"),
      debtTemplate("Capitec", "Credit Card", 10000, 80000, 18.0, 29.0, "Re-considered")
    ],
    legalRecordHints: ["Debt review inquiry"],
    expertMessages: [
      "I am considering debt review and need guidance on legal and practical implications."
    ]
  },
  {
    title: "Bureau cleanup: dispute incorrect listings",
    risk: "Medium",
    name: "Rethabile",
    surname: "Mahlangu",
    employmentStatus: "Employed",
    incomeRange: [18000, 42000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("ABSA", "Credit Card", 5000, 70000, 14.0, 25.0),
      debtTemplate("Telkom", "Telecom Arrears", 700, 10000, 0.0, 5.0)
    ],
    legalRecordHints: ["Default listing dispute"],
    expertMessages: [
      "I need support disputing inaccurate bureau listings and updating my profile correctly."
    ]
  },
  {
    title: "Young adult first credit mistakes",
    risk: "Medium",
    name: "Aphiwe",
    surname: "Mabena",
    employmentStatus: "Student",
    incomeRange: [2500, 12000],
    debtCountRange: [3, 4],
    requiredDebts: [
      debtTemplate("FNB", "Credit Card", 2000, 22000, 16.0, 26.0),
      debtTemplate("Mr Price", "Store Card", 500, 9000, 17.0, 27.0)
    ],
    expertMessages: [
      "I started credit recently and need help fixing early mistakes before they worsen."
    ]
  },
  {
    title: "Taxi operator/informal economy",
    risk: "Medium",
    name: "Jabulani",
    surname: "Masinga",
    employmentStatus: "Self-Employed",
    incomeRange: [7000, 30000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Toyota Financial Services", "Vehicle Finance", 120000, 480000, 9.5, 14.8),
      debtTemplate("Municipality Arrears", "Utility Arrears", 2000, 22000, 0.0, 5.0)
    ],
    expertMessages: [
      "My taxi income is variable and I need a debt strategy that fits irregular cash flow."
    ]
  },
  {
    title: "Credit card balance transfer optimization",
    risk: "Low",
    name: "Chantelle",
    surname: "Naidoo",
    employmentStatus: "Employed",
    incomeRange: [28000, 60000],
    debtCountRange: [2, 3],
    requiredDebts: [
      debtTemplate("Standard Bank", "Credit Card", 9000, 110000, 13.5, 24.0, "Active"),
      debtTemplate("FNB", "Credit Card", 7000, 90000, 13.0, 23.0, "Active")
    ],
    expertMessages: [
      "I want to optimize a balance transfer plan while preserving a low-risk profile."
    ]
  },
  {
    title: "Unregistered lender pressure (data only)",
    risk: "High",
    name: "Mlondi",
    surname: "Sithole",
    employmentStatus: "Unemployed",
    incomeRange: [0, 9000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("Unregistered lender", "Informal Loan", 5000, 80000, 25.0, 50.0, "Garnished"),
      debtTemplate("PEP", "Store Card", 300, 7000, 16.0, 27.0)
    ],
    legalRecordHints: ["Summons"],
    expertMessages: [
      "I am under pressure from an unregistered lender and need legal-safe support options."
    ]
  },
  {
    title: "Funeral policy arrears + store debt",
    risk: "Medium",
    name: "Bongiwe",
    surname: "Khumalo",
    employmentStatus: "Employed",
    incomeRange: [9000, 23000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Funeral Policy", "Funeral Policy", 1200, 14000, 0.0, 6.0),
      debtTemplate("Edgars", "Store Card", 900, 13000, 17.0, 27.0)
    ],
    expertMessages: [
      "My funeral policy and store account are in arrears. I need a practical catch-up plan."
    ]
  },
  {
    title: "Home loan in arrears avoiding repossession",
    risk: "High",
    name: "Stephan",
    surname: "Botha",
    employmentStatus: "Employed",
    incomeRange: [18000, 52000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("ABSA", "Home Loan", 750000, 2100000, 8.5, 12.5, "Re-considered"),
      debtTemplate("City Power", "Utility Arrears", 2500, 38000, 0.0, 5.0)
    ],
    legalRecordHints: ["Summons", "Judgment"],
    expertMessages: [
      "My home loan is in arrears and I need urgent guidance to avoid repossession risk."
    ]
  },
  {
    title: "Vehicle repossession risk",
    risk: "High",
    name: "Kea",
    surname: "Molefi",
    employmentStatus: "Employed",
    incomeRange: [9000, 28000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("MFC", "Vehicle Finance", 90000, 420000, 10.0, 15.0, "Garnished"),
      debtTemplate("Capitec", "Credit Card", 7000, 52000, 17.0, 28.0)
    ],
    legalRecordHints: ["Garnishee order"],
    expertMessages: [
      "I am at risk of losing my vehicle due to arrears and need immediate intervention steps."
    ]
  }
];

const extraScenarioTemplates: Omit<Scenario, "name" | "surname">[] = [
  {
    title: "Public sector employee recovering from holiday overspend",
    risk: "Medium",
    employmentStatus: "Employed",
    incomeRange: [14000, 36000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Nedbank", "Credit Card", 6000, 85000, 14.0, 25.0),
      debtTemplate("Woolworths", "Store Card", 1000, 15000, 17.0, 27.0)
    ],
    expertMessages: [
      "I need a disciplined recovery plan after seasonal overspending pushed my balances too high."
    ]
  },
  {
    title: "Dual-income household managing multiple vehicle contracts",
    risk: "Low",
    employmentStatus: "Employed",
    incomeRange: [45000, 115000],
    debtCountRange: [2, 4],
    requiredDebts: [
      debtTemplate("Toyota Financial Services", "Vehicle Finance", 100000, 500000, 9.0, 14.5),
      debtTemplate("WesBank", "Vehicle Finance", 90000, 450000, 9.0, 14.5)
    ],
    expertMessages: [
      "We want to reduce our monthly vehicle burden and keep our risk profile low."
    ]
  },
  {
    title: "Municipal arrears after relocation",
    risk: "Medium",
    employmentStatus: "Employed",
    incomeRange: [10000, 27000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Municipality Arrears", "Utility Arrears", 2500, 38000, 0.0, 5.0),
      debtTemplate("City Power", "Utility Arrears", 1200, 20000, 0.0, 5.0)
    ],
    expertMessages: [
      "I relocated and now have municipal arrears that are affecting my affordability."
    ]
  },
  {
    title: "Early-career professional with aggressive card usage",
    risk: "Medium",
    employmentStatus: "Employed",
    incomeRange: [18000, 52000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("FNB", "Credit Card", 6000, 95000, 15.0, 25.0),
      debtTemplate("Standard Bank", "Credit Card", 4000, 70000, 15.0, 24.0)
    ],
    expertMessages: [
      "I need a utilization reduction strategy before my profile deteriorates further."
    ]
  },
  {
    title: "Freelancer with telecom and utility arrears",
    risk: "High",
    employmentStatus: "Self-Employed",
    incomeRange: [3000, 18000],
    debtCountRange: [4, 7],
    requiredDebts: [
      debtTemplate("MTN", "Telecom Arrears", 1200, 15000, 0.0, 5.0),
      debtTemplate("Telkom", "Telecom Arrears", 900, 12000, 0.0, 5.0),
      debtTemplate("Municipality Arrears", "Utility Arrears", 2000, 32000, 0.0, 5.0)
    ],
    legalRecordHints: ["Summons"],
    expertMessages: [
      "Income dips caused telecom and utility arrears. I need urgent stabilization and restructuring."
    ]
  },
  {
    title: "Healthcare worker consolidating short-term debt",
    risk: "Low",
    employmentStatus: "Employed",
    incomeRange: [26000, 70000],
    debtCountRange: [2, 3],
    requiredDebts: [
      debtTemplate("ABSA", "Personal Loan", 12000, 90000, 14.0, 24.0),
      debtTemplate("Mediclinic", "Medical Account", 1500, 22000, 0.0, 7.0)
    ],
    expertMessages: [
      "I want to consolidate short-term debt and optimize my monthly repayment commitments."
    ]
  },
  {
    title: "Informal trader balancing stock finance and household debt",
    risk: "Medium",
    employmentStatus: "Self-Employed",
    incomeRange: [7000, 30000],
    debtCountRange: [3, 6],
    requiredDebts: [
      debtTemplate("Old Mutual Finance", "Business Loan", 25000, 220000, 14.0, 24.0),
      debtTemplate("Capitec", "Overdraft", 4000, 70000, 14.0, 24.0)
    ],
    expertMessages: [
      "I am balancing business stock finance with household commitments and need a cash-flow plan."
    ]
  },
  {
    title: "Pension-backed household with family support commitments",
    risk: "Medium",
    employmentStatus: "Pensioner",
    incomeRange: [7000, 26000],
    debtCountRange: [3, 5],
    requiredDebts: [
      debtTemplate("Funeral Policy", "Funeral Policy", 900, 12000, 0.0, 6.0),
      debtTemplate("Ackermans", "Store Card", 400, 8000, 16.0, 26.0)
    ],
    expertMessages: [
      "I rely on pension income and need an affordable debt plan while supporting family dependants."
    ]
  }
];

const extraNames = [
  "Siphesihle",
  "Anele",
  "Ntobeko",
  "Refilwe",
  "Gugulethu",
  "Khanyisa",
  "Mandla",
  "Vuyokazi",
  "Sinazo",
  "Banele",
  "Phindile",
  "Nandi",
  "Xolani",
  "Andile",
  "Itumeleng",
  "Lesego",
  "Nhlanhla",
  "Palesa",
  "Lerato",
  "Tumisang",
  "Themba",
  "Kgaugelo",
  "Sinenhlanhla",
  "Mthokozisi",
  "Aphiwe",
  "Linda",
  "Nokwanda",
  "Pabi",
  "Mosa",
  "Thato"
];

const extraSurnames = [
  "Gumede",
  "Mabizela",
  "Sebola",
  "Ramaphosa",
  "Nkomo",
  "Khumalo",
  "Mbatha",
  "Ngwenya",
  "Sibiya",
  "Mahlangu",
  "Van Der Merwe",
  "Pietersen",
  "Singh",
  "Govender",
  "Mokwena",
  "Rasmeni",
  "Qwabe",
  "Jali",
  "Mthethwa",
  "Maduna",
  "Mokgosi",
  "Mabaso",
  "Mokoena",
  "Mathebula",
  "Bosch",
  "Arendse",
  "Msimango",
  "Mthombeni",
  "Mofokeng",
  "Pule"
];

function buildExtraScenarios(total: number): Scenario[] {
  const list: Scenario[] = [];
  for (let i = 0; i < total; i += 1) {
    const template = extraScenarioTemplates[i % extraScenarioTemplates.length];
    list.push({
      ...template,
      name: extraNames[i % extraNames.length],
      surname: extraSurnames[i % extraSurnames.length]
    });
  }
  return list;
}

const wealthProfiles: WealthProfile[] = [
  {
    tier: "SUPER_RICH",
    name: "Akhona",
    surname: "Dlamini",
    risk: "Low",
    employmentStatus: "Self-Employed",
    monthlyIncome: 1450000,
    realAge: 48,
    estimatedNetWorth: 8950000000,
    assets: [
      { assetType: "Shares", assetName: "JSE Top 40 Strategic Basket", estimatedValue: 1520000000 },
      { assetType: "Company Equity", assetName: "Dlamini Infrastructure Holdings", estimatedValue: 3950000000, ownershipPercentage: 62 },
      { assetType: "Residential House", assetName: "Sandhurst Primary Estate", estimatedValue: 118000000 },
      { assetType: "Commercial House", assetName: "Rosebank Office Precinct", estimatedValue: 980000000 }
    ],
    debts: [
      { creditorName: "Nedbank CIB", debtType: "Commercial Property Facility", balance: 280000000, interestRate: 10.2, status: "Active" },
      { creditorName: "Standard Bank", debtType: "Lombard Facility", balance: 95000000, interestRate: 9.4, status: "Active" }
    ],
    advisorMessage: "Need strategic wealth structuring and tax-efficient financing for listed and private holdings."
  },
  {
    tier: "SUPER_RICH",
    name: "Karima",
    surname: "Patel",
    risk: "Low",
    employmentStatus: "Self-Employed",
    monthlyIncome: 1120000,
    realAge: 45,
    estimatedNetWorth: 6410000000,
    assets: [
      { assetType: "Shares", assetName: "SA Banking and Telco Portfolio", estimatedValue: 930000000 },
      { assetType: "Company Equity", assetName: "Patel Consumer Ventures", estimatedValue: 2680000000, ownershipPercentage: 55 },
      { assetType: "Residential House", assetName: "Bishopscourt Residence", estimatedValue: 86000000 },
      { assetType: "Commercial House", assetName: "Durban Retail Hub", estimatedValue: 720000000 }
    ],
    debts: [
      { creditorName: "ABSA Private", debtType: "Commercial Mortgage", balance: 165000000, interestRate: 10.6, status: "Active" },
      { creditorName: "FNB RMB", debtType: "Corporate Overdraft", balance: 74000000, interestRate: 11.8, status: "Active" }
    ],
    advisorMessage: "Seeking expansion finance while keeping leverage below internal family-office thresholds."
  },
  {
    tier: "SUPER_RICH",
    name: "Mpho",
    surname: "Van Rensburg",
    risk: "Medium",
    employmentStatus: "Self-Employed",
    monthlyIncome: 980000,
    realAge: 52,
    estimatedNetWorth: 5120000000,
    assets: [
      { assetType: "Shares", assetName: "JSE Industrial and Resources Fund", estimatedValue: 840000000 },
      { assetType: "Company Equity", assetName: "Van Rensburg Logistics Group", estimatedValue: 2150000000, ownershipPercentage: 58 },
      { assetType: "Residential House", assetName: "Zimbali Coastal Estate Home", estimatedValue: 74000000 },
      { assetType: "Commercial House", assetName: "Gauteng Warehousing Portfolio", estimatedValue: 690000000 }
    ],
    debts: [
      { creditorName: "Investec", debtType: "Acquisition Bridge Loan", balance: 210000000, interestRate: 12.8, status: "Re-considered" },
      { creditorName: "Standard Bank", debtType: "Commercial Mortgage", balance: 135000000, interestRate: 11.4, status: "Active" },
      { creditorName: "Nedbank CIB", debtType: "Equipment Finance", balance: 48000000, interestRate: 13.2, status: "Active" }
    ],
    advisorMessage: "Need debt-optimization and restructuring path after acquisition-cycle leverage increased."
  },
  {
    tier: "ECONOMY_MOVER",
    name: "Sanele",
    surname: "Mkhize",
    risk: "Low",
    employmentStatus: "Self-Employed",
    monthlyIncome: 420000,
    realAge: 41,
    estimatedNetWorth: 1680000000,
    assets: [
      { assetType: "Shares", assetName: "Mid-cap Growth Portfolio", estimatedValue: 240000000 },
      { assetType: "Company Equity", assetName: "Mkhize Transport and Fuel", estimatedValue: 620000000, ownershipPercentage: 64 },
      { assetType: "Residential House", assetName: "Waterfall Country Estate Home", estimatedValue: 38500000 },
      { assetType: "Commercial House", assetName: "N3 Freight Park Property", estimatedValue: 210000000 }
    ],
    debts: [
      { creditorName: "FNB Business", debtType: "Business Loan", balance: 42000000, interestRate: 12.1, status: "Active" },
      { creditorName: "WesBank", debtType: "Fleet Finance", balance: 27500000, interestRate: 11.3, status: "Active" }
    ],
    advisorMessage: "Need runway planning for expansion while preserving strong personal credit quality."
  },
  {
    tier: "ECONOMY_MOVER",
    name: "Noluthando",
    surname: "Petersen",
    risk: "Medium",
    employmentStatus: "Self-Employed",
    monthlyIncome: 355000,
    realAge: 39,
    estimatedNetWorth: 1220000000,
    assets: [
      { assetType: "Shares", assetName: "Income and Dividend Strategy", estimatedValue: 175000000 },
      { assetType: "Company Equity", assetName: "Petersen Food Processing", estimatedValue: 510000000, ownershipPercentage: 49 },
      { assetType: "Residential House", assetName: "Constantia Family Home", estimatedValue: 42000000 },
      { assetType: "Commercial House", assetName: "Cape Industrial Unit Cluster", estimatedValue: 188000000 }
    ],
    debts: [
      { creditorName: "ABSA Corporate", debtType: "Working Capital Facility", balance: 68000000, interestRate: 13.6, status: "Re-considered" },
      { creditorName: "Nedbank", debtType: "Commercial Mortgage", balance: 51000000, interestRate: 12.2, status: "Active" }
    ],
    advisorMessage: "Need improved cash-cycle management and covenant-safe debt scheduling."
  },
  {
    tier: "ECONOMY_MOVER",
    name: "Themba",
    surname: "Modise",
    risk: "Low",
    employmentStatus: "Employed",
    monthlyIncome: 280000,
    realAge: 44,
    estimatedNetWorth: 860000000,
    assets: [
      { assetType: "Shares", assetName: "Large-cap Core Portfolio", estimatedValue: 120000000 },
      { assetType: "Company Equity", assetName: "Modise Renewable Services", estimatedValue: 340000000, ownershipPercentage: 31 },
      { assetType: "Residential House", assetName: "Bryanston Family House", estimatedValue: 23000000 },
      { assetType: "Commercial House", assetName: "Pretoria Mixed-use Block", estimatedValue: 146000000 }
    ],
    debts: [
      { creditorName: "Standard Bank", debtType: "Commercial Property Loan", balance: 36000000, interestRate: 11.9, status: "Active" },
      { creditorName: "FNB", debtType: "Mortgage", balance: 14500000, interestRate: 10.3, status: "Active" }
    ],
    advisorMessage: "Need portfolio balancing between listed equity growth and property cashflow resilience."
  },
  {
    tier: "RICH",
    name: "Lerato",
    surname: "Khosa",
    risk: "Low",
    employmentStatus: "Employed",
    monthlyIncome: 185000,
    realAge: 37,
    estimatedNetWorth: 255000000,
    assets: [
      { assetType: "Shares", assetName: "Balanced Equity and ETF Basket", estimatedValue: 54000000 },
      { assetType: "Company Equity", assetName: "Khosa Design Studio", estimatedValue: 72000000, ownershipPercentage: 75 },
      { assetType: "Residential House", assetName: "Midrand Home", estimatedValue: 9200000 },
      { assetType: "Commercial House", assetName: "Sandton Medical Suites Unit", estimatedValue: 36000000 }
    ],
    debts: [
      { creditorName: "ABSA Private", debtType: "Mortgage", balance: 6800000, interestRate: 10.1, status: "Active" },
      { creditorName: "Nedbank", debtType: "Commercial Mortgage", balance: 12400000, interestRate: 11.4, status: "Active" }
    ],
    advisorMessage: "Need structured plan to convert surplus cash into long-term diversified holdings."
  },
  {
    tier: "RICH",
    name: "Yusuf",
    surname: "Ismail",
    risk: "Medium",
    employmentStatus: "Self-Employed",
    monthlyIncome: 210000,
    realAge: 40,
    estimatedNetWorth: 334000000,
    assets: [
      { assetType: "Shares", assetName: "High-yield Dividend Portfolio", estimatedValue: 76000000 },
      { assetType: "Company Equity", assetName: "Ismail Engineering Services", estimatedValue: 98000000, ownershipPercentage: 52 },
      { assetType: "Residential House", assetName: "Umhlanga Main Residence", estimatedValue: 15500000 },
      { assetType: "Commercial House", assetName: "Durban Logistics Warehouse", estimatedValue: 68000000 }
    ],
    debts: [
      { creditorName: "Investec", debtType: "Business Expansion Loan", balance: 27800000, interestRate: 13.4, status: "Re-considered" },
      { creditorName: "FNB Business", debtType: "Commercial Property Loan", balance: 19500000, interestRate: 12.3, status: "Active" }
    ],
    advisorMessage: "Need debt-cost reduction and repayment sequencing while maintaining growth capital."
  },
  {
    tier: "RICH",
    name: "Bianca",
    surname: "Fourie",
    risk: "Low",
    employmentStatus: "Employed",
    monthlyIncome: 165000,
    realAge: 35,
    estimatedNetWorth: 192000000,
    assets: [
      { assetType: "Shares", assetName: "Global Equity Wrap", estimatedValue: 48000000 },
      { assetType: "Company Equity", assetName: "Fourie Health Ventures", estimatedValue: 51000000, ownershipPercentage: 44 },
      { assetType: "Residential House", assetName: "Claremont Residence", estimatedValue: 11200000 },
      { assetType: "Commercial House", assetName: "Century City Office Unit", estimatedValue: 29400000 }
    ],
    debts: [
      { creditorName: "Standard Bank", debtType: "Mortgage", balance: 5900000, interestRate: 10.0, status: "Active" },
      { creditorName: "Nedbank", debtType: "Commercial Mortgage", balance: 8400000, interestRate: 11.2, status: "Active" }
    ],
    advisorMessage: "Need asset-liability alignment to accelerate net-worth growth with manageable leverage."
  }
];

function defaultDebtCountRange(risk: RiskLevel): [number, number] {
  if (risk === "High") return [4, 8];
  if (risk === "Medium") return [3, 5];
  return [2, 3];
}

function weightedStatusPick(risk: RiskLevel, rng: () => number): DebtStatus {
  const roll = rng();
  if (risk === "Low") {
    if (roll < 0.9) return "Active";
    if (roll < 0.99) return "Re-considered";
    return "Garnished";
  }
  if (risk === "Medium") {
    if (roll < 0.62) return "Active";
    if (roll < 0.9) return "Re-considered";
    return "Garnished";
  }
  if (roll < 0.38) return "Active";
  if (roll < 0.7) return "Re-considered";
  return "Garnished";
}

function buildDebtListForScenario(
  scenario: Scenario,
  rng: () => number
): Array<{
  creditorName: string;
  debtType: string;
  interestRate: number;
  balance: number;
  status: DebtStatus;
}> {
  const result: Array<{
    creditorName: string;
    debtType: string;
    interestRate: number;
    balance: number;
    status: DebtStatus;
  }> = [];

  const range = scenario.debtCountRange ?? defaultDebtCountRange(scenario.risk);
  const targetDebtCount = randomInt(range[0], range[1], rng);

  for (const blueprint of scenario.requiredDebts) {
    const balance = roundCurrency(randomFloat(blueprint.balanceRange[0], blueprint.balanceRange[1], rng));
    const interestRate = roundCurrency(
      randomFloat(blueprint.interestRange[0], blueprint.interestRange[1], rng)
    );

    result.push({
      creditorName: blueprint.creditorName,
      debtType: blueprint.debtType,
      interestRate,
      balance,
      status: blueprint.preferredStatus ?? weightedStatusPick(scenario.risk, rng)
    });
  }

  while (result.length < targetDebtCount) {
    const template = pickOne(debtTemplatePool, rng);
    const duplicate = result.some(
      (debt) => debt.creditorName === template.creditorName && debt.debtType === template.debtType
    );
    if (duplicate) continue;

    const balance = roundCurrency(randomFloat(template.balanceRange[0], template.balanceRange[1], rng));
    const interestRate = roundCurrency(randomFloat(template.interestRange[0], template.interestRange[1], rng));

    result.push({
      creditorName: template.creditorName,
      debtType: template.debtType,
      interestRate,
      balance,
      status: template.preferredStatus ?? weightedStatusPick(scenario.risk, rng)
    });
  }

  if (scenario.risk === "High" && !result.some((debt) => debt.status === "Garnished")) {
    const index = randomInt(0, result.length - 1, rng);
    result[index].status = "Garnished";
  }

  return result;
}

function targetMissedPaymentsForRisk(risk: RiskLevel, rng: () => number): number {
  if (risk === "Low") return randomInt(0, 1, rng);
  if (risk === "Medium") return randomInt(2, 6, rng);
  return randomInt(6, 18, rng);
}

// Required helper: payment history generator correlated with risk and debt status.
function paymentHistoryGenerator(args: {
  debts: Array<{ debtId: number; status: DebtStatus }>;
  risk: RiskLevel;
  rng: () => number;
}): PaymentRow[] {
  const baseRows: Array<PaymentRow & { debtStatus: DebtStatus }> = [];

  for (const debt of args.debts) {
    const months = randomInt(6, 12, args.rng);
    const dueDates = generateDueDates(months);
    for (const dueDate of dueDates) {
      baseRows.push({
        debt_id: debt.debtId,
        due_date: dueDate,
        paid: true,
        missed: false,
        debtStatus: debt.status
      });
    }
  }

  const targetMissed = Math.min(targetMissedPaymentsForRisk(args.risk, args.rng), baseRows.length);
  const weightedIndexes: number[] = [];

  baseRows.forEach((row, index) => {
    const weight = row.debtStatus === "Garnished" ? 4 : row.debtStatus === "Re-considered" ? 2 : 1;
    for (let i = 0; i < weight; i += 1) weightedIndexes.push(index);
  });

  const chosen = new Set<number>();
  while (chosen.size < targetMissed && weightedIndexes.length > 0) {
    chosen.add(weightedIndexes[randomInt(0, weightedIndexes.length - 1, args.rng)]);
  }

  for (const index of chosen) {
    baseRows[index].missed = true;
    baseRows[index].paid = false;
  }

  return baseRows.map(({ debtStatus: _debtStatus, ...row }) => row);
}

function buildLegalRecords(args: {
  userId: number;
  risk: RiskLevel;
  scenario: Scenario;
  debts: CreatedDebt[];
  rng: () => number;
}): Array<{ user_id: number; record_type: string; description: string }> {
  const rows: Array<{ user_id: number; record_type: string; description: string }> = [];
  const addRow = (recordType: string, description: string) => {
    if (!rows.some((row) => row.record_type === recordType && row.description === description)) {
      rows.push({ user_id: args.userId, record_type: recordType, description });
    }
  };

  for (const hint of args.scenario.legalRecordHints ?? []) {
    addRow(hint, `${hint} linked to scenario: ${args.scenario.title}.`);
  }

  const hasGarnishedDebt = args.debts.some((debt) => debt.status === "Garnished");
  if (hasGarnishedDebt) {
    addRow("Garnishee order", "Salary attachment risk due to sustained arrears on unsecured accounts.");
  }

  if (args.risk === "High") {
    const highRiskOptions = [
      ["Judgment", "Court judgment recorded after unresolved default notices."],
      ["Summons", "Summons issued after repeated non-payment and failed arrangements."],
      ["Debt review inquiry", "Consumer exploring formal debt review due to over-indebtedness."]
    ] as const;

    const target = randomInt(1, 3, args.rng);
    while (rows.length < target) {
      const option = pickOne(highRiskOptions, args.rng);
      addRow(option[0], option[1]);
    }
  }

  if (args.risk === "Medium") {
    const includeMediumRecord = args.scenario.legalRecordHints?.length
      ? true
      : args.rng() < 0.35;

    if (includeMediumRecord) {
      const mediumOptions = [
        ["Default listing dispute", "Dispute lodged for a potentially outdated default listing."],
        ["Reconsideration", "Account under reconsideration after affordability reassessment."]
      ] as const;
      const option = pickOne(mediumOptions, args.rng);
      addRow(option[0], option[1]);
    }
  }

  if (args.risk === "Low" && rows.length > 1) {
    return rows.slice(0, 1);
  }

  return rows;
}

function randomDateInLastDays(days: number, rng: () => number): Date {
  const dayOffset = randomInt(0, days, rng);
  const date = new Date();
  date.setDate(date.getDate() - dayOffset);
  return date;
}

function chooseAdvisorType(args: { risk: RiskLevel; hasLegalRecords: boolean; rng: () => number }): AdvisorType {
  if (args.hasLegalRecords && args.rng() < 0.55) return "Legal";
  if (args.risk === "High" && args.rng() < 0.5) return "Debt";
  if (args.risk === "Medium" && args.rng() < 0.45) return "Debt";
  return "Financial";
}

function shouldCreateExpertRequests(risk: RiskLevel, rng: () => number): boolean {
  if (risk === "High") return rng() < 0.94;
  if (risk === "Medium") return rng() < 0.78;
  return rng() < 0.58;
}

function recommendationRowsForRisk(risk: RiskLevel): string[] {
  if (risk === "High") {
    return [
      "Stop taking new unsecured credit immediately and prioritize essential household costs first.",
      "Request debt counselling to evaluate formal debt review and legal protections.",
      "Negotiate temporary reduced instalments on active arrears accounts before escalation.",
      "Track debit orders and move key repayments to just after payday to avoid unpaid fees.",
      "Collect account statements and verify balances before agreeing to any settlement.",
      "Address garnishee and summons documents promptly with legal support.",
      "Create a strict cashflow plan that allocates every rand of income.",
      "Prioritize high-cost unsecured debt and avoid rotating payments between creditors.",
      "Open formal disputes for incorrect bureau records while continuing compliant payments.",
      "Stabilize utilities and municipal arrears to reduce service disruption risk."
    ];
  }

  if (risk === "Medium") {
    return [
      "Keep all minimum payments current and direct surplus to the highest interest account.",
      "Target utilization below 50% this quarter and below 30% over time.",
      "Consolidate scattered store accounts into a focused repayment sequence.",
      "Shift debit orders to dates after salary clearance to improve payment consistency.",
      "Renegotiate rates or terms on personal loans with strong payment history.",
      "Dispute outdated or duplicate listings with supporting account evidence.",
      "Build a small emergency buffer to avoid new borrowing for shortfalls.",
      "Review telecom and utility contracts for lower-cost plan options.",
      "Set monthly debt reduction targets and review progress every payday.",
      "Avoid unnecessary credit limit increases while rebuilding score stability."
    ];
  }

  return [
    "Maintain low utilization and keep revolving balances below 30%.",
    "Use automated debit orders after payday to preserve payment streaks.",
    "Review bond and vehicle rates annually to reduce long-term cost.",
    "Build a stronger emergency fund to avoid distress borrowing.",
    "Use credit cards for planned spend only and settle balances early.",
    "Keep account tenure healthy by avoiding frequent account closures.",
    "Review bureau profile periodically and dispute incorrect entries quickly.",
    "Channel surplus cash into highest-rate debt even in low-risk profiles.",
    "Plan for annual expenses to prevent temporary card over-utilization.",
    "Preserve affordability by capping lifestyle inflation when income rises."
  ];
}

function estimateStandardNetWorth(args: {
  monthlyIncome: number;
  totalDebt: number;
  risk: RiskLevel;
  rng: () => number;
}): number {
  const incomeFactor = args.risk === "Low" ? randomFloat(16, 42, args.rng) : args.risk === "Medium" ? randomFloat(10, 28, args.rng) : randomFloat(4, 16, args.rng);
  const debtDrag = args.risk === "Low" ? randomFloat(0.15, 0.45, args.rng) : args.risk === "Medium" ? randomFloat(0.35, 0.75, args.rng) : randomFloat(0.65, 1.25, args.rng);
  return roundCurrency(Math.max(0, args.monthlyIncome * incomeFactor - args.totalDebt * debtDrag));
}

async function clearDemoData() {
  await prisma.wealthAssets.deleteMany();
  await prisma.paymentHistory.deleteMany();
  await prisma.expertRequests.deleteMany();
  await prisma.legalRecords.deleteMany();
  await prisma.debts.deleteMany();
  await prisma.creditProfile.deleteMany();
  await prisma.users.deleteMany();
  await prisma.providers.deleteMany();
  await prisma.aiRecommendations.deleteMany();
}

async function seedProviders() {
  await prisma.providers.createMany({
    data: [
      { provider_type: "Financial", whatsapp_number: PROVIDER_WHATSAPP_NUMBER },
      { provider_type: "Debt", whatsapp_number: PROVIDER_WHATSAPP_NUMBER },
      { provider_type: "Legal", whatsapp_number: PROVIDER_WHATSAPP_NUMBER }
    ]
  });
}

async function seedAiRecommendations() {
  const rows = (["High", "Medium", "Low"] as RiskLevel[]).flatMap((risk) =>
    recommendationRowsForRisk(risk).map((recommendationText) => ({
      risk_level: risk,
      recommendation_text: recommendationText
    }))
  );

  await prisma.aiRecommendations.createMany({ data: rows });
}

async function seedUsersAndRelations() {
  const rng = createRng(20260209);
  const allScenarios = [...mandatoryScenarios, ...buildExtraScenarios(20)];
  const usedIds = new Set<string>();
  const summaryRows: string[] = [];

  for (let index = 0; index < allScenarios.length; index += 1) {
    const scenario = allScenarios[index];
    const idNumber = generateIdNumber(index + 1, scenario.risk, usedIds);
    assertSeedIdValidity(idNumber, scenario.risk);

    const monthlyIncome = roundCurrency(randomFloat(scenario.incomeRange[0], scenario.incomeRange[1], rng));

    const user = await prisma.users.create({
      data: {
        id_number: idNumber,
        name: scenario.name,
        surname: scenario.surname,
        employment_status: scenario.employmentStatus,
        monthly_income: monthlyIncome,
        risk_level: scenario.risk,
        wealth_segment: "STANDARD",
        estimated_net_worth: 0,
        real_age: randomInt(20, 68, rng)
      }
    });

    const debtInputs = buildDebtListForScenario(scenario, rng);
    const createdDebts: CreatedDebt[] = [];

    for (const debt of debtInputs) {
      const created = await prisma.debts.create({
        data: {
          user_id: user.user_id,
          creditor_name: debt.creditorName,
          debt_type: debt.debtType,
          interest_rate: debt.interestRate,
          balance: debt.balance,
          status: debt.status
        }
      });

      createdDebts.push({
        debtId: created.debt_id,
        creditorName: created.creditor_name,
        debtType: created.debt_type,
        interestRate: created.interest_rate,
        balance: created.balance,
        status: created.status as DebtStatus
      });
    }

    const paymentRows = paymentHistoryGenerator({
      debts: createdDebts.map((debt) => ({ debtId: debt.debtId, status: debt.status })),
      risk: scenario.risk,
      rng
    });

    await prisma.paymentHistory.createMany({ data: paymentRows });

    const legalRows = buildLegalRecords({
      userId: user.user_id,
      risk: scenario.risk,
      scenario,
      debts: createdDebts,
      rng
    });

    if (legalRows.length > 0) {
      await prisma.legalRecords.createMany({ data: legalRows });
    }

    let requestCount = 0;
    if (shouldCreateExpertRequests(scenario.risk, rng)) {
      requestCount = randomInt(1, 3, rng);
      const requests = Array.from({ length: requestCount }).map(() => {
        const advisorType = chooseAdvisorType({
          risk: scenario.risk,
          hasLegalRecords: legalRows.length > 0,
          rng
        });

        return {
          user_id: user.user_id,
          advisor_type: advisorType,
          message: `${pickOne(scenario.expertMessages, rng)} Scenario: ${scenario.title}.`,
          request_date: randomDateInLastDays(30, rng)
        };
      });

      await prisma.expertRequests.createMany({ data: requests });
    }

    const totalDebt = roundCurrency(createdDebts.reduce((sum, debt) => sum + debt.balance, 0));
    const monthlyObligations = roundCurrency(
      createdDebts.reduce(
        (sum, debt) => sum + monthlyObligationEstimator(debt.debtType, debt.balance),
        0
      )
    );

    const creditScore = creditScoreForRisk(scenario.risk, rng);

    await prisma.creditProfile.create({
      data: {
        user_id: user.user_id,
        credit_score: creditScore,
        total_debt: totalDebt,
        monthly_obligations: monthlyObligations
      }
    });

    const estimatedNetWorth = estimateStandardNetWorth({
      monthlyIncome,
      totalDebt,
      risk: scenario.risk,
      rng
    });
    await prisma.users.update({
      where: { user_id: user.user_id },
      data: { estimated_net_worth: estimatedNetWorth }
    });

    summaryRows.push(
      `${user.name} ${user.surname} | STANDARD | NetWorth R${formatCurrency(estimatedNetWorth)} | ${scenario.risk} | ${creditScore} | #Debts ${createdDebts.length} | TotalDebt R${formatCurrency(totalDebt)} | MonthlyObligations R${formatCurrency(monthlyObligations)} | #Requests ${requestCount} | #LegalRecords ${legalRows.length}`
    );
  }

  for (let index = 0; index < wealthProfiles.length; index += 1) {
    const profile = wealthProfiles[index];
    const idNumber = generateIdNumber(allScenarios.length + index + 1, profile.risk, usedIds);
    assertSeedIdValidity(idNumber, profile.risk);

    const user = await prisma.users.create({
      data: {
        id_number: idNumber,
        name: profile.name,
        surname: profile.surname,
        employment_status: profile.employmentStatus,
        monthly_income: profile.monthlyIncome,
        risk_level: profile.risk,
        wealth_segment: profile.tier,
        estimated_net_worth: roundCurrency(profile.estimatedNetWorth),
        real_age: profile.realAge
      }
    });

    const createdDebts: CreatedDebt[] = [];
    for (const debt of profile.debts) {
      const created = await prisma.debts.create({
        data: {
          user_id: user.user_id,
          creditor_name: debt.creditorName,
          debt_type: debt.debtType,
          interest_rate: debt.interestRate,
          balance: roundCurrency(debt.balance),
          status: debt.status
        }
      });

      createdDebts.push({
        debtId: created.debt_id,
        creditorName: created.creditor_name,
        debtType: created.debt_type,
        interestRate: created.interest_rate,
        balance: created.balance,
        status: created.status as DebtStatus
      });
    }

    const paymentRows = paymentHistoryGenerator({
      debts: createdDebts.map((debt) => ({ debtId: debt.debtId, status: debt.status })),
      risk: profile.risk,
      rng
    });
    await prisma.paymentHistory.createMany({ data: paymentRows });

    if (profile.risk === "Medium") {
      await prisma.legalRecords.create({
        data: {
          user_id: user.user_id,
          record_type: "Reconsideration",
          description: "Leveraged portfolio facilities under active reconsideration."
        }
      });
    }

    await prisma.wealthAssets.createMany({
      data: profile.assets.map((asset) => ({
        user_id: user.user_id,
        asset_type: asset.assetType,
        asset_name: asset.assetName,
        estimated_value: roundCurrency(asset.estimatedValue),
        ownership_percentage: asset.ownershipPercentage ?? 100
      }))
    });

    await prisma.expertRequests.create({
      data: {
        user_id: user.user_id,
        advisor_type: "Financial",
        message: profile.advisorMessage,
        request_date: randomDateInLastDays(14, rng)
      }
    });

    const totalDebt = roundCurrency(createdDebts.reduce((sum, debt) => sum + debt.balance, 0));
    const monthlyObligations = roundCurrency(
      createdDebts.reduce(
        (sum, debt) => sum + monthlyObligationEstimator(debt.debtType, debt.balance),
        0
      )
    );
    const creditScore = creditScoreForRisk(profile.risk, rng);

    await prisma.creditProfile.create({
      data: {
        user_id: user.user_id,
        credit_score: creditScore,
        total_debt: totalDebt,
        monthly_obligations: monthlyObligations
      }
    });

    summaryRows.push(
      `${user.name} ${user.surname} | ${profile.tier} | NetWorth R${formatCurrency(profile.estimatedNetWorth)} | ${profile.risk} | ${creditScore} | #Assets ${profile.assets.length} | #Debts ${createdDebts.length} | TotalDebt R${formatCurrency(totalDebt)}`
    );
  }

  console.log("\nFinAware seed summary:\n");
  for (const row of summaryRows) {
    console.log(row);
  }

  console.log(`\nSeeded ${summaryRows.length} users with full relational demo data.`);
  console.log(`Providers use WhatsApp click-to-chat number: ${PROVIDER_WHATSAPP_NUMBER}`);
}

async function main() {
  await clearDemoData();
  await seedProviders();
  await seedAiRecommendations();
  await seedUsersAndRelations();
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
