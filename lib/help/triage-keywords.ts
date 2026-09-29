import { AssistanceType, assistanceTypeValues } from "@/lib/domain";

// Keyword triage: instant, runs in the browser as the user types, and good at the cases that
// matter most — a summons is a legal matter now, whatever else the message says. The language
// model (lib/help/triage.ts, server only) can refine it afterwards.

export type Triage = {
  assistanceType: AssistanceType | null;
  confidence: "clear" | "likely" | "unclear";
  reasons: string[];
  source: "model" | "keywords";
};

const SIGNALS: Record<AssistanceType, Array<{ pattern: RegExp; reason: string }>> = {
  LEGAL_ADVISOR: [
    { pattern: /\bsummons\b/i, reason: "you mention a summons — there is a deadline to respond" },
    { pattern: /\bsheriff\b/i, reason: "you mention the sheriff" },
    { pattern: /\bcourt\b|\bmagistrate\b/i, reason: "you mention court" },
    { pattern: /\bjudge?ments?\b/i, reason: "you mention a judgment" },
    { pattern: /\bgarnishee\b|\bemoluments?\b|\bEAO\b/i, reason: "you mention a garnishee order on your salary" },
    { pattern: /\bsection\s*129\b|\bletter of demand\b/i, reason: "you mention a legal notice or letter of demand" },
    { pattern: /\brepossess|\battach(ed|ment)? (my|our) (car|goods|furniture)|\beviction\b|\bevict/i, reason: "you mention losing property or your home" },
    { pattern: /\battorney\b|\blawyer\b|\blegal action\b/i, reason: "you mention legal action" }
  ],
  DEBT_COUNSELLOR: [
    { pattern: /\bdebt review\b|\bover-?indebted\b/i, reason: "you mention debt review" },
    { pattern: /\b(can'?t|cannot|unable to|struggl\w* to) (afford|pay|keep up|make)\b/i, reason: "you are struggling to keep up with repayments" },
    { pattern: /\barrears\b|\bbehind (on|with)\b|\bmissed (my |a |several )?payments?\b/i, reason: "you are behind on payments" },
    { pattern: /\bcreditors?\b.{0,20}\b(call|phon|harass)/i, reason: "creditors are calling you" },
    { pattern: /\bconsolidat|\brestructur|\bpayment arrangement\b/i, reason: "you want to restructure what you owe" },
    { pattern: /\bblacklist/i, reason: "you are worried about your credit record" }
  ],
  FINANCIAL_ADVISOR: [
    { pattern: /\bbudget/i, reason: "you want help with a budget" },
    { pattern: /\bsav(e|ing|ings)\b|\bemergency fund\b/i, reason: "you want to save" },
    { pattern: /\binvest/i, reason: "you ask about investing" },
    { pattern: /\bretire/i, reason: "you ask about retirement" },
    { pattern: /\btax\b|\bSARS\b/i, reason: "you ask about tax" },
    { pattern: /\binsurance\b|\bcover\b|\bmedical aid\b/i, reason: "you ask about cover" }
  ]
};

export function triageByKeywords(message: string): Triage {
  const scores = assistanceTypeValues.map((type) => {
    const hits = SIGNALS[type].filter((signal) => signal.pattern.test(message));
    return { type, hits };
  });

  // Legal first: a summons or garnishee order has a clock on it, and the other advisors would
  // refer the user on anyway.
  const legal = scores.find((score) => score.type === AssistanceType.LEGAL_ADVISOR)!;
  const ranked = legal.hits.length > 0 ? [legal] : [...scores].sort((a, b) => b.hits.length - a.hits.length);
  const top = ranked[0];

  if (!top || top.hits.length === 0) {
    return { assistanceType: null, confidence: "unclear", reasons: [], source: "keywords" };
  }
  const others = scores.filter((score) => score.type !== top.type).reduce((sum, score) => sum + score.hits.length, 0);
  return {
    assistanceType: top.type,
    confidence: top.hits.length >= 2 && others === 0 ? "clear" : "likely",
    reasons: top.hits.map((hit) => hit.reason),
    source: "keywords"
  };
}
