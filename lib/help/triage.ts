import { askModel } from "@/lib/ai/model";
import { AssistanceType, assistanceTypeValues } from "@/lib/domain";
import { triageByKeywords, type Triage } from "@/lib/help/triage-keywords";

export { triageByKeywords, type Triage };

// Request triage: which advisor fits what the user wrote. Keywords first — they are instant,
// testable and good at the cases that matter most (a summons is a legal matter now, whatever else
// the message says). The language model, when there is one, reads the whole message and gives a
// reason in its own words; its choice is still limited to the three advisors FinAware has.

export async function triageRequest(message: string, fetchImpl?: typeof fetch): Promise<Triage> {
  const keywords = triageByKeywords(message);
  if (message.trim().length < 20) return keywords;

  const result = await askModel({
    task: "triage",
    system:
      "You route a South African user's request for help to one of three advisors: FINANCIAL_ADVISOR (budgets, saving, investing, planning), DEBT_COUNSELLOR (unaffordable debt, arrears, debt review under the National Credit Act), LEGAL_ADVISOR (summons, judgments, garnishee orders, court, repossession). Anything with a legal deadline goes to LEGAL_ADVISOR. Give one short reason addressed to the user, starting with 'you'.",
    user: message,
    schema: {
      name: "triage",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { assistanceType: { type: "string", enum: assistanceTypeValues }, reason: { type: "string" } },
        required: ["assistanceType", "reason"]
      }
    },
    validate: (value) => {
      const candidate = value as { assistanceType?: string; reason?: string };
      return assistanceTypeValues.includes(candidate.assistanceType as AssistanceType) && typeof candidate.reason === "string"
        ? (candidate as { assistanceType: AssistanceType; reason: string })
        : null;
    },
    timeoutMs: 10_000,
    fetchImpl
  });

  if (!result.ok) return keywords;
  // A legal signal outranks the model: the clock on a summons does not wait for a second opinion.
  if (keywords.assistanceType === AssistanceType.LEGAL_ADVISOR && result.value.assistanceType !== AssistanceType.LEGAL_ADVISOR) {
    return keywords;
  }
  return { assistanceType: result.value.assistanceType, confidence: "likely", reasons: [result.value.reason], source: "model" };
}
