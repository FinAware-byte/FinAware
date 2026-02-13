import { prisma } from "@/lib/db/prisma";
import {
  ConsultationStatus,
  type AppConsultationRequest,
  type AssistanceType,
  toAssistanceType
} from "@/lib/domain";

function parseUserId(userId: string): number | null {
  const value = Number(userId);
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}

function mapRequest(row: {
  request_id: number;
  advisor_type: string;
  message: string;
  request_date: Date;
}): AppConsultationRequest {
  return {
    id: String(row.request_id),
    requestId: row.request_id,
    assistanceType: toAssistanceType(row.advisor_type),
    message: row.message,
    status: ConsultationStatus.PENDING,
    createdAt: row.request_date
  };
}

export async function listConsultationRequests(userId: string): Promise<AppConsultationRequest[]> {
  const parsedUserId = parseUserId(userId);
  if (!parsedUserId) return [];

  const rows = await prisma.expertRequests.findMany({
    where: { user_id: parsedUserId },
    orderBy: { request_date: "desc" }
  });

  return rows.map(mapRequest);
}

export async function createConsultationRequest(input: {
  userId: string;
  assistanceType: AssistanceType;
  message: string;
}): Promise<AppConsultationRequest> {
  const parsedUserId = parseUserId(input.userId);
  if (!parsedUserId) {
    throw new Error("Invalid user id");
  }

  const created = await prisma.expertRequests.create({
    data: {
      user_id: parsedUserId,
      advisor_type: input.assistanceType,
      message: input.message,
      request_date: new Date()
    }
  });

  return mapRequest(created);
}
