import { PrismaClient } from "@prisma/client";
import { authLoginSchema } from "../lib/validation";

const prisma = new PrismaClient();

type UserIdentifierRow = {
  user_id: number;
  id_number: string;
  document_type: string;
  passport_country: string | null;
};

async function run() {
  const users = (await prisma.users.findMany({
    select: {
      user_id: true,
      id_number: true,
      document_type: true,
      passport_country: true
    },
    orderBy: { user_id: "asc" }
  })) as UserIdentifierRow[];

  const invalid = users
    .map((user) => {
      const parsed = authLoginSchema.safeParse({
        idNumberOrPassport: user.id_number,
        documentType: user.document_type === "PASSPORT" ? "PASSPORT" : "SA_ID",
        passportCountry: user.passport_country
      });
      if (parsed.success) return null;

      return {
        userId: user.user_id,
        idNumberOrPassport: user.id_number,
        documentType: user.document_type,
        passportCountry: user.passport_country,
        reason: parsed.error.issues[0]?.message ?? "Invalid identifier"
      };
    })
    .filter(Boolean);

  const summary = {
    totalUsers: users.length,
    validAtLogin: users.length - invalid.length,
    invalidAtLogin: invalid.length
  };

  console.log(JSON.stringify(summary, null, 2));

  if (invalid.length > 0) {
    console.log(JSON.stringify({ invalid }, null, 2));
    process.exitCode = 1;
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
