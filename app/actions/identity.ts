"use server";

import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { identityUpdateSchema } from "@/lib/validation";

export type IdentityActionState = {
  error?: string;
  success?: string;
};

export async function updateIdentity(
  _prevState: IdentityActionState,
  formData: FormData
): Promise<IdentityActionState> {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) {
    return { error: "Session not found. Please login again." };
  }

  const parsed = identityUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    bankAccountNumber: formData.get("bankAccountNumber") ?? "",
    monthlyIncome: formData.get("monthlyIncome"),
    employmentStatus: formData.get("employmentStatus"),
    realAge: formData.get("realAge"),
    creditScore: formData.get("creditScore")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values" };
  }

  const downloadPassword = String(formData.get("downloadPassword") ?? "").trim();
  const result = await callServiceJson("identity", `/identity/profile/${sessionUserId}`, {
    method: "PATCH",
    body: JSON.stringify({
      ...parsed.data,
      downloadPassword
    })
  });
  if (result.status < 200 || result.status >= 300) {
    const payload = result.payload as { message?: string };
    return { error: payload.message ?? "Unable to update identity profile." };
  }

  return { success: "Changes saved successfully." };
}
