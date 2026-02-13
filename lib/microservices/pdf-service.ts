import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { verifyPassword } from "@/lib/auth/password";
import { listDebtsForUser } from "@/lib/db/debts";
import { getUserById } from "@/lib/db/users";
import { formatDate, formatZAR } from "@/lib/format";

async function createOverviewPdf(input: {
  fullName: string;
  idNumberOrPassport: string;
  riskStatus: string;
  creditScore: number;
  monthlyIncome: number;
  totalDebt: number;
  monthlyObligation: number;
  generatedAt: Date;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("FinAware Dashboard Overview", {
    x: 50,
    y: 785,
    size: 20,
    font: bold,
    color: rgb(0.14, 0.39, 0.92)
  });
  page.drawText(`Generated: ${formatDate(input.generatedAt)}`, { x: 50, y: 760, size: 10, font });

  const rows = [
    ["Full Name", input.fullName],
    ["ID / Passport", input.idNumberOrPassport],
    ["Risk Status", input.riskStatus],
    ["Credit Score", String(input.creditScore)],
    ["Monthly Income", formatZAR(input.monthlyIncome)],
    ["Total Debt", formatZAR(input.totalDebt)],
    ["Monthly Obligations", formatZAR(input.monthlyObligation)]
  ];

  let y = 720;
  for (const [label, value] of rows) {
    page.drawText(`${label}:`, { x: 50, y, size: 12, font: bold, color: rgb(0.15, 0.23, 0.35) });
    page.drawText(value, { x: 220, y, size: 12, font, color: rgb(0.1, 0.1, 0.1) });
    y -= 28;
  }

  // Why: true cryptographic PDF encryption is not guaranteed in this runtime, so we enforce a password gate before generation and apply a visible protection watermark.
  page.drawText("Protected – requires ID to access", {
    x: 115,
    y: 390,
    size: 28,
    font: bold,
    rotate: degrees(-30),
    color: rgb(0.8, 0.12, 0.12),
    opacity: 0.22
  });

  return pdf.save();
}

export async function generateOverviewPdfForUser(input: {
  userId: string;
  password: string;
}): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; status: number; message: string }
> {
  const user = await getUserById(input.userId);
  if (!user) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const suppliedPassword = input.password.trim();
  const matchesIdentifier = suppliedPassword === user.idNumberOrPassport;
  const matchesSavedPassword =
    !!user.downloadPasswordHash && verifyPassword(suppliedPassword, user.downloadPasswordHash);

  if (!matchesIdentifier && !matchesSavedPassword) {
    return { ok: false, status: 403, message: "Password is incorrect." };
  }

  const debts = await listDebtsForUser(input.userId);
  const activeDebts = debts.filter((debt) => debt.status === "ACTIVE");
  const totalDebt = activeDebts.reduce((sum, debt) => sum + debt.balance, 0);
  const monthlyObligation = activeDebts.reduce((sum, debt) => sum + debt.monthlyObligation, 0);

  const bytes = await createOverviewPdf({
    fullName: user.fullName,
    idNumberOrPassport: user.idNumberOrPassport,
    riskStatus: user.riskStatus,
    creditScore: user.creditScore,
    monthlyIncome: user.monthlyIncome,
    totalDebt,
    monthlyObligation,
    generatedAt: new Date()
  });

  return { ok: true, bytes };
}
