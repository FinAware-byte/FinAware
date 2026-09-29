import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../lib/db/prisma";
import { applyDemoProfiles } from "../prisma/demo/apply";
import { buildPayslip, payslipPdf, payslipText, statementCsv } from "../prisma/demo/documents";

// Demo data for presenting FinAware.
//
//   npm run demo:data              profiles, Money Plans, statements and payslips
//   npm run demo:data -- --assess  …and a risk assessment for each persona, through the running
//                                  app (needs the stack and the ML service up)
//
// Safe to run again: profiles and plans are replaced, files are overwritten with the same bytes.
// Statements and payslips land in public/samples/demo, so a presenter can download them from the
// app itself and upload them where a demo needs them.

const OUT = join(process.cwd(), "public", "samples", "demo");
const FINANCIAL_API = process.env.FINANCIAL_API_SERVICE_URL?.replace(/"/g, "") ?? "http://127.0.0.1:4108";

async function main() {
  const assess = process.argv.includes("--assess");
  console.log("Profiles and Money Plans:");
  const { applied, missing } = await applyDemoProfiles((line) => console.log(line));
  for (const persona of missing) console.log(`  skipped ${persona.slug}: no user with ID ${persona.idNumber} (run npm run seed first)`);

  mkdirSync(join(OUT, "statements"), { recursive: true });
  mkdirSync(join(OUT, "payslips"), { recursive: true });
  console.log("\nStatements and payslips:");
  for (const { persona, facts } of applied) {
    writeFileSync(join(OUT, "statements", `${persona.slug}.csv`), statementCsv(persona, facts));
    const slip = buildPayslip(persona, facts);
    if (slip) {
      writeFileSync(join(OUT, "payslips", `${persona.slug}-2026-09.txt`), payslipText(persona, facts, slip));
      writeFileSync(join(OUT, "payslips", `${persona.slug}-2026-09.pdf`), await payslipPdf(persona, facts, slip));
    }
    console.log(`  ${persona.slug}: statement (${persona.statement.format})${slip ? `, payslip net ${slip.net.toFixed(2)}` : ""}`);
  }

  if (assess) {
    console.log("\nRisk assessments (through the running app):");
    for (const { persona, userId } of applied) {
      try {
        const response = await fetch(`${FINANCIAL_API}/risk-assessment/${userId}`, { method: "POST", signal: AbortSignal.timeout(30_000) });
        const body = (await response.json()) as { riskLevel?: string; riskScore?: number; message?: string };
        console.log(
          response.ok
            ? `  ${persona.slug}: ${body.riskLevel} (${Math.round(body.riskScore ?? 0)}/100)`
            : `  ${persona.slug}: not assessed — ${response.status} ${body.message ?? ""}`
        );
      } catch (error) {
        console.log(`  ${persona.slug}: not assessed — ${error instanceof Error ? error.message : "request failed"} (is the stack running?)`);
      }
    }
  } else {
    console.log("\nRisk assessments skipped. With the app running: npm run demo:data -- --assess");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
