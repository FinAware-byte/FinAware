import { prisma } from "@/lib/db/prisma";

function parseId(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

/** The kinds of legal record on file for a user ("Summons", "Judgment", "Garnishee order", …). */
export async function listLegalRecordTypes(userId: string): Promise<string[]> {
  const id = parseId(userId);
  if (!id) return [];
  const records = await prisma.legalRecords.findMany({ where: { user_id: id }, select: { record_type: true } });
  return records.map((record) => record.record_type);
}
