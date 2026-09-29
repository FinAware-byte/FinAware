import { calculateCreditScore } from "@/lib/finance/credit-score";
import { MAX_RECOMMENDATIONS, RULES, RULES_VERSION } from "@/lib/risk/recommendation-rules";
import { BUDGET_RULES_VERSION } from "@/lib/budget/plan";

// Model card: what each model in FinAware does, what it does not, and how well it does it.
//
// Every figure carries where it came from, because they are not all the same kind of claim:
//   live   — reported by the running model service right now (/model-info), so it cannot drift
//            from the model actually answering predictions;
//   report — from the evaluation analysis in docs/ml/ML_METHODOLOGY.md, which is not shipped in
//            the model image, so it is quoted with its section;
//   code   — read from the application's own constants.
// When the model service is down the live figures say so; nothing is filled in from memory.

export type ModelInfo = {
  model: { name: string; version: string };
  target: { name: string; version: string; status: string };
  trainedAt: string;
  metrics: { accuracy: number; f1_macro: number; f1_weighted: number };
  riskScoreFormula?: string;
  explanationMethod?: string;
  evaluation?: { trainRows?: number; testRows?: number; highRiskRecall?: number; meanTopProbability?: number };
  paymentMissModel?: {
    available: boolean;
    reason?: string;
    model?: { name: string; version: string };
    trainedAt?: string;
    decisionThreshold?: number;
    metrics?: { roc_auc: number; average_precision: number; brier: number };
    beatsPastMissRateHeuristic?: boolean;
    evaluation?: {
      trainRows?: number;
      testRows?: number;
      testMissRate?: number;
      precisionAtThreshold?: number;
      recallAtThreshold?: number;
      baselines?: Record<string, { roc_auc?: number; average_precision?: number }>;
    };
  };
  peerSegments?: {
    available: boolean;
    reason?: string;
    model?: { name: string; version: string };
    k?: number;
    silhouette?: number;
    recordsUsed?: number;
    recordsExcluded?: number;
    trainedAt?: string;
    segments?: Array<{ name: string; share: number }>;
  };
};

export type FigureSource = "live" | "report" | "code";

export type CardFigure = {
  label: string;
  value: string;
  source: FigureSource;
  /** What the number means, in plain words — a bare 99.7% invites the wrong reading. */
  detail?: string;
  /** Where a "report" figure is written up. */
  reference?: string;
};

export type ModelCard = {
  key: string;
  name: string;
  kind: "Machine learning" | "Calculation" | "Fixed rules" | "Language model";
  version: string | null;
  trainedAt: string | null;
  whereUsed: Array<{ label: string; href: string }>;
  does: string;
  doesNot: string[];
  figures: CardFigure[];
  /** Set when live figures could not be fetched. */
  unavailable: string | null;
  status: { label: string; tone: "warn" | "ok" } | null;
};

const pct = (value: number, digits = 1) => `${(value * 100).toFixed(digits)}%`;
const count = (value: number) => value.toLocaleString("en-ZA");

function riskCard(info: ModelInfo | null): ModelCard {
  const live: CardFigure[] = info
    ? [
        {
          label: "Agrees with the risk rubric",
          value: pct(info.metrics.accuracy),
          source: "live",
          detail: `On ${info.evaluation?.testRows ? count(info.evaluation.testRows) : "held-out"} profiles it never saw in training. This is agreement with a rule, not accuracy at predicting what happens to people.`
        },
        ...(info.evaluation?.highRiskRecall !== undefined
          ? [
              {
                label: "High-risk profiles it catches",
                value: pct(info.evaluation.highRiskRecall),
                source: "live" as const,
                detail: "Of the test profiles the rubric calls High risk, the share the model also calls High."
              }
            ]
          : []),
        ...(info.evaluation?.meanTopProbability !== undefined
          ? [
              {
                label: "Average confidence",
                value: pct(info.evaluation.meanTopProbability),
                source: "live" as const,
                detail: "Very high because the thing it learned is a fixed rule. It is not a sign of certainty about real life."
              }
            ]
          : [])
      ]
    : [];

  return {
    key: "risk",
    name: "Financial risk tier",
    kind: "Machine learning",
    version: info ? `${info.model.name} v${info.model.version}` : null,
    trainedAt: info?.trainedAt ?? null,
    whereUsed: [{ label: "Risk Assessment", href: "/risk-assessment" }],
    does:
      "Places your finances in Low, Medium or High risk from your income, expenses, savings, credit score and debts, and shows which of those it leaned on for you (SHAP).",
    doesNot: [
      "It does not predict whether you will default or miss a payment. There is no real outcome in its training data — it learned to reproduce a documented rubric of five rules of thumb.",
      "It is not a credit bureau score, and no lender sees it.",
      "Its factor list shows what it relied on for your result, not what caused your situation."
    ],
    figures: [
      ...live,
      {
        label: "Without the rubric's own inputs",
        value: "F1 0.52–0.55",
        source: "report",
        detail:
          "Retrained on only age, employment, loan amount, rate and whether there is a loan, it does little better than guessing. The near-perfect score above comes from reproducing the rubric.",
        reference: "ML methodology §6"
      },
      {
        label: "With realistic savings",
        value: "91.1%",
        source: "report",
        detail:
          "Agreement falls from 99.7% when savings are 0–6 months of expenses, which almost no training record has — and the mistakes under-estimate risk. Your result carries a warning when this applies.",
        reference: "ML methodology §6"
      },
      {
        label: "Training data",
        value: info?.evaluation?.trainRows ? `${count(info.evaluation.trainRows)} profiles` : "Synthetic",
        source: info?.evaluation?.trainRows ? "live" : "report",
        detail: "A synthetic dataset of South African personal finances. It describes no real people.",
        // A citation only when the figure is the report's; a live row count needs none.
        ...(info?.evaluation?.trainRows ? {} : { reference: "ML methodology §2" })
      }
    ],
    unavailable: info ? null : "The model service is not responding, so the live figures cannot be shown.",
    status:
      info && info.target.status !== "approved"
        ? { label: `Risk definition v${info.target.version} is provisional, pending approval`, tone: "warn" }
        : null
  };
}

function paymentCard(info: ModelInfo | null): ModelCard {
  const model = info?.paymentMissModel;
  const available = Boolean(model?.available && model.metrics);
  const evaluation = model?.evaluation;
  const baselines = Object.entries(evaluation?.baselines ?? {});

  const live: CardFigure[] =
    available && model?.metrics
      ? [
          {
            label: "Ranks a missed payment above a paid one",
            value: `${pct(model.metrics.roc_auc, 0)} of the time`,
            source: "live",
            detail:
              baselines.length > 0
                ? `ROC AUC ${model.metrics.roc_auc.toFixed(2)}. For comparison: ${baselines
                    .map(([name, result]) => `${name.replace(/^Baseline:\s*/, "")} ${result.roc_auc?.toFixed(2)}`)
                    .join(", ")}. Better than chance, far from certain.`
                : `ROC AUC ${model.metrics.roc_auc.toFixed(2)}, where 0.50 is chance.`
          },
          ...(evaluation?.recallAtThreshold !== undefined && evaluation?.precisionAtThreshold !== undefined
            ? [
                {
                  label: "Missed payments it flags",
                  value: pct(evaluation.recallAtThreshold, 0),
                  source: "live" as const,
                  detail: `At its ${pct(model.decisionThreshold ?? 0, 0)} warning threshold. Of the payments it flags, ${pct(evaluation.precisionAtThreshold, 0)} are actually missed — most warnings are false alarms, which is why they are worded as prompts.`
                }
              ]
            : []),
          ...(evaluation?.testRows
            ? [
                {
                  label: "Tested on",
                  value: `${count(evaluation.testRows)} payments`,
                  source: "live" as const,
                  detail: `The most recent due dates, held back from training. ${evaluation.testMissRate !== undefined ? `${pct(evaluation.testMissRate)} of them were missed.` : ""}`.trim()
                }
              ]
            : [])
        ]
      : [];

  return {
    key: "payment",
    name: "Missed-payment outlook",
    kind: "Machine learning",
    version: model?.model ? `${model.model.name} v${model.model.version}` : null,
    trainedAt: model?.trainedAt ?? null,
    whereUsed: [
      { label: "Risk Assessment", href: "/risk-assessment" },
      { label: "Money Plan", href: "/money-plan" }
    ],
    does:
      "Estimates the chance of missing each upcoming payment, learned from recorded payments and whether each was actually missed — a real outcome, unlike the risk tier.",
    doesNot: [
      "It does not know why a payment was missed, or anything about your month beyond your payment record.",
      "It has not found a timing pattern: the demo data spreads missed payments evenly through time, so streaks and recency carry little signal.",
      "In the Money Plan it only changes the wording of the advice, never a rand of the allocation."
    ],
    figures: live,
    unavailable: available
      ? null
      : info
        ? "The missed-payment model is not loaded, so its figures cannot be shown."
        : "The model service is not responding, so the live figures cannot be shown.",
    status: null
  };
}

function peerCard(info: ModelInfo | null): ModelCard {
  const peers = info?.peerSegments;
  const available = Boolean(peers?.available && peers.k);
  return {
    key: "peers",
    name: "Peer groups",
    kind: "Machine learning",
    version: peers?.model ? `${peers.model.name} v${peers.model.version}` : null,
    trainedAt: peers?.trainedAt ?? null,
    whereUsed: [{ label: "Risk Assessment", href: "/risk-assessment" }],
    does:
      "Places you in a group of similar profiles by income, living costs, loan repayments and credit score, then shows where each of your figures sits within that group — and, where the group is split, what its members with money left over each month look like.",
    doesNot: [
      "It does not compare you with real people: the groups are built from the same synthetic dataset as the risk model.",
      "The groups are bands, not natural types. The data's columns are generated independently, so the groups overlap.",
      "Savings are compared but not used to form groups — the dataset's savers hold far more than real households, so nearly every real saver falls outside it."
    ],
    figures: available
      ? [
          {
            label: "Groups",
            value: String(peers!.k),
            source: "live",
            detail: `Chosen by silhouette from 3 to 6: ${(peers!.segments ?? []).map((s) => s.name).join("; ")}.`
          },
          {
            label: "How distinct the groups are",
            value: `Silhouette ${peers!.silhouette?.toFixed(2)}`,
            source: "live",
            detail: "On a scale from −1 to 1, where values near 0 mean heavily overlapping groups. This is weak structure, stated rather than hidden."
          },
          {
            label: "Profiles in the groups",
            value: count(peers!.recordsUsed ?? 0),
            source: "live",
            detail: `${count(peers!.recordsExcluded ?? 0)} records were left out because their loan repayments exceed their whole income, which no real household sustains.`
          }
        ]
      : [],
    unavailable: available
      ? null
      : info
        ? "Peer groups are not loaded, so their figures cannot be shown."
        : "The model service is not responding, so the live figures cannot be shown.",
    status: null
  };
}

function creditScoreCard(): ModelCard {
  // Labels and weights come from the calculation itself, so this card cannot describe a different
  // formula from the one that produces the score.
  const factors = calculateCreditScore({ monthlyIncome: 0, debts: [] }).factors;
  return {
    key: "credit-score",
    name: "Credit score",
    kind: "Calculation",
    version: null,
    trainedAt: null,
    whereUsed: [
      { label: "Score Coach", href: "/score-coach" },
      { label: "Dashboard", href: "/dashboard" }
    ],
    does:
      "Works out a 300–850 score from what FinAware records: your payments, what your repayments cost against your income, how long your record is, the mix of accounts and any judgments. It is recalculated whenever a debt changes, and it cannot be typed in.",
    doesNot: [
      "It is not a bureau score. Bureaus also use enquiries, account ages and data FinAware does not have, so your real score will differ.",
      "It is not machine learning — the same record always gives the same score."
    ],
    figures: factors.map((factor) => ({
      label: factor.label,
      value: pct(factor.weight, 0),
      source: "code" as const
    })),
    unavailable: null,
    status: null
  };
}

function rulesCard(): ModelCard {
  return {
    key: "recommendations",
    name: "Risk recommendations",
    kind: "Fixed rules",
    version: `Rules v${RULES_VERSION}`,
    trainedAt: null,
    whereUsed: [{ label: "Risk Assessment", href: "/risk-assessment" }],
    does: `Chooses up to ${MAX_RECOMMENDATIONS} recommendations from ${RULES.length} fixed rules, using your risk tier, the factors the risk model leaned on, and your own figures. Every recommendation shows the rule that fired under "Why this recommendation?".`,
    doesNot: [
      "No language model writes them, and the same result always gives the same recommendations.",
      "They are general guidance, not financial advice for your circumstances."
    ],
    figures: [
      { label: "Rules", value: String(RULES.length), source: "code" },
      { label: "Most shown at once", value: String(MAX_RECOMMENDATIONS), source: "code" }
    ],
    unavailable: null,
    status: null
  };
}

function moneyPlanCard(): ModelCard {
  return {
    key: "money-plan",
    name: "Money Plan and goal planner",
    kind: "Fixed rules",
    version: `Budget rules v${BUDGET_RULES_VERSION}`,
    trainedAt: null,
    whereUsed: [{ label: "Money Plan", href: "/money-plan" }],
    does:
      "Takes your income, essentials and debt minimums, keeps a little back for surprises, builds a small safety net, then sends the rest to your most expensive debt. Payoff dates come from simulating every month, interest first. Goals are tested against the same plan.",
    doesNot: [
      "It does not predict a credit score change — no one outside a bureau can.",
      "It assumes today's interest rates and that every payment is made."
    ],
    figures: [],
    unavailable: null,
    status: null
  };
}

function wordingCard(languageModelConfigured: boolean): ModelCard {
  return {
    key: "wording",
    name: "Dashboard wording",
    kind: "Language model",
    version: null,
    trainedAt: null,
    whereUsed: [{ label: "Dashboard", href: "/dashboard" }],
    does:
      "When a language model is configured, it may reword the dashboard's recommendations. The amounts are worked out by FinAware first and passed to it; it phrases them.",
    doesNot: [
      "It is never asked for a number, and the figures on screen are always FinAware's own — even when the wording is the model's.",
      "If it is unavailable, the calculated wording is shown instead, marked \"Worked out from your accounts\"."
    ],
    figures: [],
    unavailable: null,
    status: languageModelConfigured
      ? { label: "Configured", tone: "ok" }
      : { label: "Not configured — calculated wording is used", tone: "warn" }
  };
}

export function buildModelCards(info: ModelInfo | null, options: { languageModelConfigured: boolean }): ModelCard[] {
  return [
    riskCard(info),
    paymentCard(info),
    peerCard(info),
    creditScoreCard(),
    rulesCard(),
    moneyPlanCard(),
    wordingCard(options.languageModelConfigured)
  ];
}
