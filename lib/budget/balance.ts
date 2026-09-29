import type { EssentialCategory, EssentialItem, PlanDebt } from "@/lib/budget/plan";

// Where to take money from, and where to put it, so the month balances.
//
// The guides below are the ordinary rules of thumb households are taught (housing around a third
// of income, and so on). They are not law and the interface says so: a family supporting three
// people on one salary will break several of them and still be doing everything right. They are
// used only to decide which line to look at FIRST when a month does not balance — never to tell
// someone their spending is wrong.

export const BENCHMARKS: Record<EssentialCategory, { share: number; guide: string }> = {
  housing: { share: 0.33, guide: "about a third of income" },
  groceries: { share: 0.15, guide: "about 15% of income" },
  transport: { share: 0.15, guide: "about 15% of income" },
  utilities: { share: 0.08, guide: "under 10% of income" },
  healthcare: { share: 0.08, guide: "under 10% of income" },
  insurance: { share: 0.07, guide: "under 10% of income" },
  education: { share: 0.1, guide: "about 10% of income" },
  childcare: { share: 0.1, guide: "about 10% of income" },
  other: { share: 0.05, guide: "a small share of income" }
};

export const CATEGORY_LABELS: Record<EssentialCategory, string> = {
  housing: "Rent or bond",
  groceries: "Groceries",
  transport: "Transport",
  utilities: "Electricity, water and data",
  healthcare: "Healthcare",
  insurance: "Insurance",
  education: "School or studies",
  childcare: "Childcare or support",
  other: "Other essentials"
};

export type BalanceMove = {
  direction: "reduce" | "add";
  label: string;
  amount: number;
  reason: string;
  category?: EssentialCategory;
  /** What this line is today, so the interface can show the before and after. */
  currentValue?: number;
};

export type Recommendation = {
  headline: string;
  summary: string;
  moves: BalanceMove[];
  /** Money the moves below could not account for; never hidden. */
  stillToFind: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A month that does not balance. Categories that sit furthest above their usual guide are named
 * first, because that is where a rand is most likely to be found — not because anyone is
 * overspending. The shortfall is never quietly absorbed: whatever the moves cannot cover is
 * reported as still to find.
 */
export function movesToCloseGap(args: {
  shortfall: number;
  monthlyIncome: number;
  essentials: EssentialItem[];
}): { moves: BalanceMove[]; stillToFind: number } {
  const moves: BalanceMove[] = [];
  let remaining = args.shortfall;

  const overBenchmark = args.essentials
    .map((item) => {
      const benchmark = BENCHMARKS[item.category];
      const ceiling = args.monthlyIncome * benchmark.share;
      return { item, benchmark, excess: item.amount - ceiling, ceiling };
    })
    .filter((row) => row.excess > 0)
    .sort((a, b) => b.excess - a.excess);

  for (const row of overBenchmark) {
    if (remaining <= 0) break;
    const amount = round(Math.min(row.excess, remaining));
    if (amount < 1) continue;
    const sharePercent = Math.round((row.item.amount / args.monthlyIncome) * 100);
    moves.push({
      direction: "reduce",
      category: row.item.category,
      label: CATEGORY_LABELS[row.item.category],
      amount,
      currentValue: row.item.amount,
      reason: `This takes ${sharePercent}% of your income. A common guide is ${row.benchmark.guide}, so it is the first place to look.`
    });
    remaining = round(remaining - amount);
  }

  return { moves, stillToFind: Math.max(0, round(remaining)) };
}

/** A month with money left over: name exactly where it should go and why. */
export function movesToUseSurplus(args: {
  allocations: { key: string; label: string; amount: number; target?: string; reason: string }[];
}): BalanceMove[] {
  return args.allocations
    .filter((allocation) => allocation.amount > 0 && allocation.key !== "breathing_room")
    .map((allocation) => ({
      direction: "add" as const,
      label: allocation.target ?? allocation.label,
      amount: allocation.amount,
      reason: allocation.reason
    }));
}

export function buildRecommendation(args: {
  status: "deficit" | "tight" | "healthy";
  shortfall: number;
  surplus: number;
  monthlyIncome: number;
  essentials: EssentialItem[];
  allocations: { key: string; label: string; amount: number; target?: string; reason: string }[];
  debts: PlanDebt[];
}): Recommendation {
  if (args.status === "deficit") {
    const { moves, stillToFind } = movesToCloseGap({
      shortfall: args.shortfall,
      monthlyIncome: args.monthlyIncome,
      essentials: args.essentials
    });

    return {
      headline: "Close the monthly gap first",
      summary:
        moves.length > 0
          ? "Your month does not balance. These are the lines with the most room in them, largest first."
          : "Your month does not balance, and none of your essentials look unusually high for your income.",
      moves,
      stillToFind
    };
  }

  const moves = movesToUseSurplus({ allocations: args.allocations });
  const hasDebt = args.debts.length > 0;

  return {
    headline: hasDebt ? "Put the surplus where it costs you least" : "Your month balances — now build on it",
    summary:
      args.status === "tight"
        ? "There is not much spare, so every rand below is doing a specific job."
        : hasDebt
          ? "Your essentials and minimum payments are covered. This is where the rest should go."
          : "With no debt left to clear, the surplus goes to cover and long-term savings.",
    moves,
    stillToFind: 0
  };
}
