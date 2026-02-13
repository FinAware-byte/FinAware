import { redirect } from "next/navigation";
import { IdentityForm } from "@/components/forms/identity-form";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

type IdentityProfilePayload = {
  userId: string;
  fullName: string;
  idNumberOrPassport: string;
  bankAccountNumber: string | null;
  monthlyIncome: number;
  employmentStatus: "EMPLOYED" | "UNEMPLOYED" | "SELF_EMPLOYED" | "STUDENT";
  realAge: number;
  creditScore: number;
  riskStatus: "HIGH" | "MEDIUM" | "LOW";
};

export default async function IdentityPage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("identity", `/identity/profile/${sessionUserId}`, {
    method: "GET"
  });

  if (result.status < 200 || result.status >= 300) {
    return <p className="text-sm text-slate-500">Unable to load profile.</p>;
  }

  const user = result.payload as IdentityProfilePayload;

  const identityUser = {
    fullName: user.fullName,
    idNumberOrPassport: user.idNumberOrPassport,
    bankAccountNumber: user.bankAccountNumber,
    monthlyIncome: user.monthlyIncome,
    employmentStatus: user.employmentStatus,
    realAge: user.realAge,
    creditScore: user.creditScore
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My Identity</h1>
        <p className="text-sm text-slate-500">Manage your profile and financial identity details.</p>
      </div>
      <IdentityForm user={identityUser} />
    </div>
  );
}
