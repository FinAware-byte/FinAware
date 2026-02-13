import { type AssistanceType } from "@/lib/domain";
import { createConsultationRequest, listConsultationRequests } from "@/lib/db/consultations";
import { getProviderNumber } from "@/lib/db/providers";
import { buildWhatsAppUrl } from "@/lib/help/whatsapp";

export async function listUserHelpRequests(userId: string) {
  return listConsultationRequests(userId);
}

export async function createHelpRequest(input: {
  userId: string;
  assistanceType: AssistanceType;
  message: string;
}) {
  const created = await createConsultationRequest(input);
  const providerWhatsAppNumber = await getProviderNumber(input.assistanceType);
  const whatsappMessage = `FinAware Consultation Request\nType: ${input.assistanceType.replaceAll("_", " ")}\nMessage: ${input.message}`;

  return {
    request: created,
    whatsappUrl: buildWhatsAppUrl(providerWhatsAppNumber, whatsappMessage)
  };
}
