import { simulatePayoff, type MoneyPlan } from "@/lib/budget/plan";
import { formatZAR } from "@/lib/format";
import type { WorkingLine } from "@/types/working";

// Goal planner: "save R10 000 by December" → a monthly amount, tested against the Money Plan.
//
// Two halves. parseGoal reads the sentence — a rand amount, a month, or "a 3-month emergency
// fund" — with plain patterns, and reports exactly which words it understood, so a misreading is
// visible and the fields can be corrected. testGoal then asks the question that matters: the Money
// Plan already gives every spare rand a job, so where would this money come from, and what does
// taking it cost? Taking it from the extra debt payment is simulated with the same payoff
// arithmetic the plan uses, so "debt-free 4 months later" is calculated, not estimated.

export type GoalMonth = { year: number; month: number }; // month is 0–11

export type ParsedGoal = {
  amount: number | null;
  deadline: GoalMonth | null;
  /** Set for "a 3-month emergency fund": the target is this many months of essentials. */
  emergencyFundMonths: number | null;
  /** The pieces of the sentence that were understood, for "we read this as …". */
  understood: string[];
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18
};

function toNumber(word: string): number | null {
  const lower = word.toLowerCase();
  if (lower in NUMBER_WORDS) return NUMBER_WORDS[lower];
  const value = Number(lower);
  return Number.isFinite(value) ? value : null;
}

export function monthOf(date: Date): GoalMonth {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function addMonths(from: GoalMonth, count: number): GoalMonth {
  const index = from.year * 12 + from.month + count;
  return { year: Math.floor(index / 12), month: index % 12 };
}

/** Monthly amounts between now and the deadline month: October, November and December from September is 3. */
export function monthsUntil(deadline: GoalMonth, from: GoalMonth): number {
  return (deadline.year - from.year) * 12 + (deadline.month - from.month);
}

export function monthLabel(value: GoalMonth): string {
  return `${MONTH_NAMES[value.month]} ${value.year}`;
}

export function durationLabel(months: number | null): string {
  if (months === null) return "never, at this rate";
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? `${years} year${years === 1 ? "" : "s"}` : `${years} yr ${rest} mo`;
}

// "10 000", "10,000" and "10000" are all ten thousand; "10,50" is ten rand fifty. A comma or space
// followed by exactly three digits is a thousands separator, anything else is the decimal mark.
function readNumber(digits: string, decimals: string | undefined, suffix: string | undefined): number {
  const whole = Number(digits.replace(/[\s, ]/g, ""));
  const value = decimals ? Number(`${whole}.${decimals}`) : whole;
  const scale = !suffix ? 1 : /^(k|thousand)$/i.test(suffix) ? 1_000 : 1_000_000;
  return Math.round(value * scale * 100) / 100;
}

function parseAmount(text: string): { value: number; words: string } | null {
  const withRand = /\bR\s?(\d{1,3}(?:[ , ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(k|thousand|m|mil|million)?\b/i.exec(text);
  if (withRand) return { value: readNumber(withRand[1], withRand[2], withRand[3]), words: withRand[0].trim() };

  const withSuffix = /\b(\d+)(?:[.,](\d+))?\s*(k|thousand|million)\b/i.exec(text);
  if (withSuffix) return { value: readNumber(withSuffix[1], withSuffix[2], withSuffix[3]), words: withSuffix[0].trim() };

  // A bare figure only counts after "save", so "3 months" is never read as three rand.
  const bare = /\bsave\s+(\d{1,3}(?:[ , ]\d{3})+|\d{3,})\b/i.exec(text);
  if (bare) return { value: readNumber(bare[1], undefined, undefined), words: bare[1] };

  return null;
}

function parseDeadline(text: string, from: GoalMonth): { value: GoalMonth; words: string } | null {
  const relative = /\b(?:in|within|over)\s+(?:the\s+next\s+)?(\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen)\s+(months?|years?)\b/i.exec(text);
  if (relative) {
    const count = toNumber(relative[1]) ?? 0;
    const months = /^year/i.test(relative[2]) ? count * 12 : count;
    if (months > 0) return { value: addMonths(from, months), words: relative[0].trim() };
  }

  const iso = /\b(\d{4})-(\d{1,2})(?:-\d{1,2})?\b/.exec(text);
  if (iso) {
    const month = Number(iso[2]) - 1;
    if (month >= 0 && month < 12) return { value: { year: Number(iso[1]), month }, words: iso[0] };
  }

  // South African order: day/month/year.
  const dated = /\b\d{1,2}\/(\d{1,2})\/(\d{4})\b/.exec(text);
  if (dated) {
    const month = Number(dated[1]) - 1;
    if (month >= 0 && month < 12) return { value: { year: Number(dated[2]), month }, words: dated[0] };
  }

  const named =
    /\b(?:by|before|until|till|for|in|end\s+of)\s+(?:the\s+end\s+of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\.?\s*(\d{4})?/i.exec(
      text
    );
  if (named) {
    const month = MONTH_NAMES.findIndex((name) => name.toLowerCase().startsWith(named[1].slice(0, 3).toLowerCase()));
    // A month with no year is the next one of that name: "by September", said in September,
    // means next September — this month is already under way.
    const year = named[2] ? Number(named[2]) : month > from.month ? from.year : from.year + 1;
    return { value: { year, month }, words: named[0].trim() };
  }

  const festive = /\b(christmas|festive season|december holidays|end of (?:the |this )?year)\b/i.exec(text);
  if (festive) {
    const year = from.month === 11 ? from.year + 1 : from.year;
    return { value: { year, month: 11 }, words: festive[0] };
  }

  if (/\bnext month\b/i.test(text)) return { value: addMonths(from, 1), words: "next month" };

  return null;
}

function parseEmergencyFund(text: string): { months: number; words: string } | null {
  const counted =
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[\s-]*months?(?:['’]s?)?\s+(?:of\s+)?(?:emergency|expenses|essentials|living|buffer|safety|cover)/i.exec(text);
  if (counted) {
    const months = toNumber(counted[1]);
    if (months && months > 0) return { months, words: counted[0].trim() };
  }
  const named = /\b(emergency fund|safety net|rainy[- ]day fund)\b/i.exec(text);
  // Three months of essentials is the usual guide, and what the Money Plan works towards.
  return named ? { months: 3, words: named[0] } : null;
}

export function parseGoal(text: string, today: Date): ParsedGoal {
  const from = monthOf(today);
  const amount = parseAmount(text);
  const deadline = parseDeadline(text, from);
  const fund = parseEmergencyFund(text);

  return {
    amount: amount?.value ?? null,
    deadline: deadline?.value ?? null,
    emergencyFundMonths: amount ? null : (fund?.months ?? null),
    understood: [amount?.words, !amount ? fund?.words : undefined, deadline?.words].filter(
      (words): words is string => Boolean(words)
    )
  };
}

// ---------------------------------------------------------------------------------------------

export type GoalInput = {
  target: number;
  /** Already put aside towards this goal. For an emergency fund, the savings on record. */
  alreadySaved: number;
  deadline: GoalMonth;
  from: GoalMonth;
  isEmergencyFund: boolean;
};

export type GoalVerdict = "fits" | "fits_with_tradeoff" | "tight" | "does_not_fit" | "no_surplus" | "already_there" | "no_time";

export type GoalSource = {
  key: string;
  label: string;
  amount: number;
  cost: string | null;
  /** How the amount was arrived at, when it is not simply this month's allocation. */
  note?: string;
};

export type DebtImpact = {
  extraBefore: number;
  extraAfter: number;
  monthsBefore: number | null;
  monthsAfter: number | null;
  moreInterest: number;
};

export type GoalTest = {
  verdict: GoalVerdict;
  headline: string;
  summary: string;
  months: number;
  stillToSave: number;
  /** Needed every month to reach the goal on time, rounded up to the rand so it is reached. */
  monthly: number;
  /** Where the monthly amount would come from, in the order it is taken. */
  sources: GoalSource[];
  debtImpact: DebtImpact | null;
  working: WorkingLine[];
};

export type PlanForGoal = Pick<MoneyPlan, "status" | "allocations" | "unallocated" | "shortfall" | "debts" | "savings">;

const amountOf = (plan: PlanForGoal, key: string) =>
  plan.allocations.filter((allocation) => allocation.key === key).reduce((sum, allocation) => sum + allocation.amount, 0);

const cents = (value: number) => Math.round(value * 100) / 100;

export function testGoal(goal: GoalInput, plan: PlanForGoal): GoalTest {
  const months = monthsUntil(goal.deadline, goal.from);
  const stillToSave = cents(Math.max(0, goal.target - Math.max(0, goal.alreadySaved)));
  const monthly = months > 0 ? Math.ceil(stillToSave / months) : stillToSave;
  const by = monthLabel(goal.deadline);

  const working: WorkingLine[] = [
    { label: goal.isEmergencyFund ? "Emergency fund target" : "Goal", value: formatZAR(goal.target) },
    // "Still to save" only earns its line when something was taken off the goal.
    ...(goal.alreadySaved > 0
      ? [
          { label: goal.isEmergencyFund ? "− Savings you already have" : "− Already put aside", value: formatZAR(goal.alreadySaved) },
          { label: "= Still to save", value: formatZAR(stillToSave), result: true }
        ]
      : []),
    ...(months > 0
      ? [
          {
            label: `÷ Months to save (${monthLabel(addMonths(goal.from, 1))} to ${by})`,
            value: String(months)
          },
          { label: "= Every month, rounded up to the rand", value: formatZAR(monthly), result: true }
        ]
      : [])
  ];

  const base = { months, stillToSave, monthly, working, sources: [] as GoalSource[], debtImpact: null };

  if (stillToSave === 0) {
    return {
      ...base,
      verdict: "already_there",
      headline: "You are already there",
      summary: goal.isEmergencyFund
        ? "Your savings already cover this. Keep them where you can reach them quickly, and top them up after you use them."
        : "What you have put aside already covers this goal."
    };
  }

  if (months < 1) {
    return {
      ...base,
      verdict: "no_time",
      headline: "Pick a month after this one",
      summary: "A goal needs at least one month to save towards it. Choose a later month below."
    };
  }

  if (plan.status === "deficit") {
    return {
      ...base,
      verdict: "no_surplus",
      headline: "There is nothing to save from yet",
      summary: `Your plan is ${formatZAR(plan.shortfall ?? 0)} short every month before any goal. Closing that gap comes first — the plan above shows where to find it.`
    };
  }

  // The plan funds its safety net only until the net reaches its target; from then on that money
  // goes to the extra debt payment. Over the months of a goal, then, the net receives only the
  // gap to its target, and the rest of this month's safety-net figure is really debt money.
  // Both are averaged over the goal period. Taking this month's figures for every month said
  // "nothing else changes" for an emergency fund that, once the net was full, ate the debt payment.
  const bufferAllocations = plan.allocations.filter((a) => a.key === "starter_buffer" || a.key === "full_buffer");
  const bufferMonthly = bufferAllocations.reduce((sum, a) => sum + a.amount, 0);
  const bufferTarget = Math.max(0, ...bufferAllocations.map((a) => a.targetAmount ?? 0));
  const bufferOverGoal = months > 0 ? Math.min(bufferMonthly * months, Math.max(0, bufferTarget - plan.savings)) : 0;
  const bufferAverage = months > 0 ? cents(bufferOverGoal / months) : 0;
  const redirected = cents(bufferMonthly - bufferAverage);
  const debtPool = cents(amountOf(plan, "extra_debt") + (plan.debts.length > 0 ? redirected : 0));

  // The order money is taken in, cheapest first. The starter safety net is never tapped for
  // another goal: the plan protects it so the next surprise does not become new debt.
  const pools: Array<GoalSource & { kind: "free" | "debt" | "buffer" | "margin" }> = [
    ...(goal.isEmergencyFund
      ? [
          {
            key: "buffer",
            label: "What the plan already puts in your safety net",
            amount: bufferAverage,
            cost: null,
            note:
              bufferAverage < bufferMonthly
                ? `The plan puts in ${formatZAR(bufferMonthly)} a month only until your safety net reaches ${formatZAR(bufferTarget)}, which averages ${formatZAR(bufferAverage)} a month over ${months} months.`
                : undefined,
            kind: "free" as const
          }
        ]
      : []),
    { key: "free", label: "Money the plan has not given a job", amount: plan.unallocated + amountOf(plan, "long_term"), cost: null, kind: "free" },
    {
      key: "extra_debt",
      label: "Your extra debt payment",
      amount: debtPool,
      cost: "Your debt is cleared later",
      note:
        redirected > 0 && plan.debts.length > 0
          ? `Averaged over ${months} months: once your safety net is full, the plan moves ${formatZAR(bufferMonthly)} a month from it to debt.`
          : undefined,
      kind: "debt"
    },
    ...(!goal.isEmergencyFund
      ? [{ key: "full_buffer", label: "Your emergency fund top-up", amount: amountOf(plan, "full_buffer"), cost: "Your emergency fund grows more slowly", kind: "buffer" as const }]
      : []),
    { key: "breathing_room", label: "The breathing room the plan keeps back", amount: amountOf(plan, "breathing_room"), cost: "Nothing is left for surprises", kind: "margin" }
  ];

  let needed = monthly;
  const sources: GoalSource[] = [];
  const taken: Record<string, number> = { free: 0, debt: 0, buffer: 0, margin: 0 };
  for (const pool of pools) {
    if (needed <= 0) break;
    const take = cents(Math.min(needed, pool.amount));
    if (take <= 0) continue;
    sources.push({ key: pool.key, label: pool.label, amount: take, cost: pool.cost, ...(pool.note ? { note: pool.note } : {}) });
    taken[pool.kind] += take;
    needed = cents(needed - take);
  }

  // What leaving less for the extra debt payment costs, from the same simulation the plan runs.
  let debtImpact: DebtImpact | null = null;
  if (taken.debt > 0 && plan.debts.length > 0) {
    // The goal borrows from the debt payment only while it runs; afterwards the money goes back
    // to debt. Simulating the smaller payment for the whole payoff (years, for a bond) put the
    // cost of a one-year goal at over R130 000 of interest. Both runs share the same schedule —
    // including the safety-net money moving to debt once the net is full — so the difference
    // between them is the goal and nothing else.
    const extraBefore = debtPool;
    const extraAfter = cents(extraBefore - taken.debt);
    const netFullByThen = bufferMonthly * months >= Math.max(0, bufferTarget - plan.savings);
    const extraAfterGoal = cents(amountOf(plan, "extra_debt") + (netFullByThen ? bufferMonthly : 0));
    const before = simulatePayoff(plan.debts, (month) => (month <= months ? extraBefore : extraAfterGoal));
    const after = simulatePayoff(plan.debts, (month) => (month <= months ? extraAfter : extraAfterGoal));
    debtImpact = {
      extraBefore,
      extraAfter,
      monthsBefore: before.months,
      monthsAfter: after.months,
      moreInterest: cents(Math.max(0, after.interest - before.interest))
    };
  }

  const withSources = { ...base, sources, debtImpact };

  if (needed > 0) {
    // Short even with everything but the safety net. Say what the plan can do instead: how long
    // the goal takes at the most it can spare, and what the deadline would actually reach.
    const spare = pools.filter((pool) => pool.kind !== "margin").reduce((sum, pool) => sum + pool.amount, 0);
    const monthsNeeded = spare > 0 ? Math.ceil(stillToSave / spare) : null;
    // What they would actually have by the deadline, counting what is already put aside.
    const reachable = cents(Math.max(0, goal.alreadySaved) + spare * months);
    return {
      ...withSources,
      verdict: "does_not_fit",
      headline: "Not by then — but here is when",
      summary:
        spare > 0 && monthsNeeded !== null
          ? `It needs ${formatZAR(monthly)} a month, and your plan can spare ${formatZAR(spare)}. At that rate you would reach it by ${monthLabel(addMonths(goal.from, monthsNeeded))} — or have ${formatZAR(reachable)} by ${by}.`
          : `It needs ${formatZAR(monthly)} a month, and your plan has nothing spare once the essentials, debt minimums and safety net are paid.`
    };
  }

  if (taken.margin > 0) {
    return {
      ...withSources,
      verdict: "tight",
      headline: "It fits, only just",
      summary: `Reaching it by ${by} uses ${formatZAR(taken.margin)} of the breathing room your plan keeps for surprises. One unexpected cost and the goal slips — a later month would be safer.`
    };
  }

  if (taken.debt > 0 || taken.buffer > 0) {
    const debtLine =
      debtImpact && debtImpact.monthsBefore !== null && debtImpact.monthsAfter !== null
        ? ` You would be debt-free in ${durationLabel(debtImpact.monthsAfter)} instead of ${durationLabel(debtImpact.monthsBefore)}, and pay about ${formatZAR(debtImpact.moreInterest)} more in interest.`
        : "";
    return {
      ...withSources,
      verdict: "fits_with_tradeoff",
      headline: "It fits, at a cost",
      summary:
        taken.debt > 0
          ? `${taken.debt >= monthly ? "All of it" : `${formatZAR(taken.debt)} of the ${formatZAR(monthly)}`} comes out of your extra debt payment.${debtLine}`
          : `${formatZAR(taken.buffer)} of it comes out of your emergency fund top-up, so that fund grows more slowly.`
    };
  }

  return {
    ...withSources,
    verdict: "fits",
    headline: "It fits",
    summary: `Put ${formatZAR(monthly)} a month aside and you will have ${formatZAR(goal.target)} by ${by}. Your plan already has that much to spare, so nothing else changes.`
  };
}
