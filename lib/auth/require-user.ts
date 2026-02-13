import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

type SessionUser = {
  userId: string;
  fullName: string;
  riskStatus: "HIGH" | "MEDIUM" | "LOW";
};

export async function requireSessionUser() {
  const userId = getSessionUserId();
  if (!userId) redirect("/");

  const result = await callServiceJson("auth", `/auth/users/${userId}`, { method: "GET" });
  if (result.status < 200 || result.status >= 300) redirect("/");

  return result.payload as SessionUser;
}
