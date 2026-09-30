"use server";

import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { identityUpdateSchema } from "@/lib/validation";
import { expectedAgeFromSouthAfricanId } from "@/lib/identification/rules";

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
    realAge: formData.get("realAge")
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form values" };
  }

  // Validate the entered age against the immutable ID before the update reaches the service so the
  // user receives a useful field-level message instead of a generic server error.
  const current = await callServiceJson("identity", `/identity/profile/${sessionUserId}`, { method: "GET" });
  if (current.status !== 200) {
    const payload = current.payload as { message?: string };
    return { error: payload.message ?? "Unable to verify your identity details." };
  }
  const currentProfile = current.payload as { idNumberOrPassport?: string };
  if (currentProfile.idNumberOrPassport && /^[0-9]{13}$/.test(currentProfile.idNumberOrPassport)) {
    const expectedAge = expectedAgeFromSouthAfricanId(currentProfile.idNumberOrPassport);
    if (expectedAge === null) return { error: "The South African ID number is invalid." };
    if (parsed.data.realAge !== expectedAge) {
      return { error: `Real age does not match the ID date of birth. The correct age is ${expectedAge}.` };
    }
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
