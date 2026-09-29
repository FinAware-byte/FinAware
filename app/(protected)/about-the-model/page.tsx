import { redirect } from "next/navigation";
import { ModelCardList } from "@/components/models/model-card-list";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { buildModelCards, type ModelInfo } from "@/lib/models/model-card";

// Model card: what each model in FinAware does, what it does not, and how well — with every
// figure labelled by where it came from. Live figures are asked of the running model service.
export default async function AboutTheModelPage() {
  const userId = getSessionUserId();
  if (!userId) redirect("/login");

  let info: ModelInfo | null = null;
  try {
    const response = await callServiceJson("ml", "/model-info", { method: "GET", signal: AbortSignal.timeout(5000) });
    info = response.status === 200 ? (response.payload as ModelInfo) : null;
  } catch {
    info = null;
  }

  // Only whether a key exists — never the key, and never a call to check it.
  const cards = buildModelCards(info, { languageModelConfigured: Boolean(process.env.OPENAI_API_KEY) });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">About the models</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          FinAware uses three machine-learning models, a calculated credit score and two sets of fixed rules. This page
          says what each one does, what it does not, and how well it works — including the figures that are less
          flattering.
        </p>
      </div>

      <ModelCardList cards={cards} />

      <p className="text-xs text-slate-500">
        The full evaluation — data audit, model comparison, ablation and limitations — is in the project&apos;s ML
        methodology. Demo data only; nothing here is financial advice.
      </p>
    </div>
  );
}
