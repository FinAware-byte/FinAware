import Link from "next/link";
import { redirect } from "next/navigation";
import { OfferChecker } from "@/components/offer-check/offer-checker";
import { getSessionUserId } from "@/lib/auth/session";

// Loan offer check: paste a message, see whether the cost is legal and whether it reads like a
// scam. The interest caps move with the repo rate, so the rate is a setting rather than a
// constant; update NCA_REPO_RATE when the Reserve Bank changes it.
const DEFAULT_REPO_RATE = 7;

export default function CheckOfferPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  const configured = Number(process.env.NCA_REPO_RATE);
  const repoRatePercent = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_REPO_RATE;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/help" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Get Help
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Check a Loan Offer</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Got an SMS or WhatsApp offering a loan? Paste it here. FinAware checks what it costs against the limits in the
          National Credit Act, and looks for the signs of a scam or a loan shark.
        </p>
      </div>
      <OfferChecker repoRatePercent={repoRatePercent} />
    </div>
  );
}
