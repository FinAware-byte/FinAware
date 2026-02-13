import { redirect } from "next/navigation";
import { HelpRequestForm } from "@/components/forms/help-request-form";
import { getSessionUserId } from "@/lib/auth/session";
import type { AppConsultationRequest } from "@/lib/domain";
import { callServiceJson } from "@/lib/microservices/proxy";

export default async function HelpPage() {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("help", `/help/requests/${sessionUserId}`, {
    method: "GET"
  });
  if (result.status < 200 || result.status >= 300) {
    return <p className="text-sm text-slate-500">Unable to load consultation requests.</p>;
  }

  const requests = (result.payload as Array<AppConsultationRequest & { createdAt: string }>).map((request) => ({
    ...request,
    createdAt: new Date(request.createdAt)
  }));
  const supportPhone = process.env.SUPPORT_PHONE ?? "+27 11 555 0142";
  const supportEmail = process.env.SUPPORT_EMAIL ?? "support@finaware.demo";

  const serializedRequests = requests.map((request) => ({
    id: request.id,
    assistanceType: request.assistanceType,
    status: request.status,
    message: request.message,
    createdAt: request.createdAt.toISOString()
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Get Expert Help</h1>
        <p className="text-sm text-slate-500">Request a consultation and connect to support quickly.</p>
      </div>
      <HelpRequestForm
        initialRequests={serializedRequests}
        supportPhone={supportPhone}
        supportEmail={supportEmail}
      />
    </div>
  );
}
