import Link from "next/link";
import { redirect } from "next/navigation";
import { HelpRequestForm } from "@/components/forms/help-request-form";
import { getSessionUserId } from "@/lib/auth/session";
import { assistanceTypeValues, type AppConsultationRequest, type AssistanceType } from "@/lib/domain";
import { callServiceJson } from "@/lib/microservices/proxy";

export default async function HelpPage({ searchParams }: { searchParams?: { type?: string } }) {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) redirect("/");

  const result = await callServiceJson("help", `/help/requests/${sessionUserId}`, {
    method: "GET"
  });

  if (result.status === 401 || result.status === 404) {
    redirect("/login");
  }

  if (result.status < 200 || result.status >= 300) {
    const payload = result.payload as { message?: string };
    return (
      <p className="text-sm text-slate-500">
        Unable to load consultation requests. {payload.message ? `(${payload.message})` : ""}
      </p>
    );
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
      <Link
        href="/help/debt-review"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/50 p-4 transition hover:border-brand-300 hover:bg-brand-50"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-900">Not sure whether debt review is right for you?</span>
          <span className="block text-sm text-slate-600">
            Check first — worked out from your own accounts, including which of them a counsellor could include.
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-700">Debt Review Check →</span>
      </Link>
      <Link
        href="/help/check-offer"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/40 p-4 transition hover:border-rose-300 hover:bg-rose-50"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-900">Been offered a loan by SMS or WhatsApp?</span>
          <span className="block text-sm text-slate-600">
            Paste it in — FinAware checks the cost against the law and looks for the signs of a scam.
          </span>
        </span>
        <span className="text-sm font-semibold text-rose-700">Check a Loan Offer →</span>
      </Link>
      <Link
        href="/help/case-summary"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
      >
        <span>
          <span className="block text-sm font-semibold text-slate-900">Going to see an advisor?</span>
          <span className="block text-sm text-slate-600">
            Take a one-page summary of your situation, so the first conversation starts from the facts.
          </span>
        </span>
        <span className="text-sm font-semibold text-brand-700">Case Summary →</span>
      </Link>
      <HelpRequestForm
        initialRequests={serializedRequests}
        supportPhone={supportPhone}
        supportEmail={supportEmail}
        defaultAssistanceType={
          assistanceTypeValues.includes(searchParams?.type as AssistanceType)
            ? (searchParams?.type as AssistanceType)
            : undefined
        }
      />
    </div>
  );
}
