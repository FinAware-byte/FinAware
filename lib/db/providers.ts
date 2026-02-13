import { prisma } from "@/lib/db/prisma";
import { AssistanceType, type AssistanceType as AssistanceTypeValue } from "@/lib/domain";

function getDefaultProviderNumber(type: AssistanceTypeValue): string {
  if (type === AssistanceType.FINANCIAL_ADVISOR) {
    return process.env.PROVIDER_WHATSAPP_NUMBER_FINANCIAL ?? process.env.PROVIDER_WHATSAPP_NUMBER ?? "27670298265";
  }
  if (type === AssistanceType.DEBT_COUNSELLOR) {
    return process.env.PROVIDER_WHATSAPP_NUMBER_DEBT ?? process.env.PROVIDER_WHATSAPP_NUMBER ?? "27670298265";
  }
  return process.env.PROVIDER_WHATSAPP_NUMBER_LEGAL ?? process.env.PROVIDER_WHATSAPP_NUMBER ?? "27670298265";
}

export async function ensureDefaultProviders(): Promise<void> {
  const providerTypes: AssistanceTypeValue[] = [
    AssistanceType.FINANCIAL_ADVISOR,
    AssistanceType.DEBT_COUNSELLOR,
    AssistanceType.LEGAL_ADVISOR
  ];

  for (const providerType of providerTypes) {
    await prisma.providers.upsert({
      where: { provider_type: providerType },
      update: {},
      create: {
        provider_type: providerType,
        whatsapp_number: getDefaultProviderNumber(providerType)
      }
    });
  }
}

export async function getProviderNumber(advisorType: AssistanceTypeValue): Promise<string> {
  await ensureDefaultProviders();
  const provider = await prisma.providers.findUnique({
    where: { provider_type: advisorType }
  });

  return provider?.whatsapp_number ?? getDefaultProviderNumber(advisorType);
}
