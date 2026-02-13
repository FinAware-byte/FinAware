import { redirect } from "next/navigation";
import { DebtsManager } from "@/components/forms/debts-manager";
import { getSessionUserId } from "@/lib/auth/session";
import type { AppDebt } from "@/lib/domain";
import { callServiceJson } from "@/lib/microservices/proxy";

export default async function DebtsPage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("debts", `/debts/${sessionUserId}`, {
    method: "GET"
  });

  if (result.status < 200 || result.status >= 300) {
    return <p className="text-sm text-slate-500">Unable to load debt accounts.</p>;
  }

  const debts = result.payload as AppDebt[];

  return <DebtsManager initialDebts={debts} />;
}
