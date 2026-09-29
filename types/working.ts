// A calculation shown as a receipt: the figures that went in, then the answer under a rule.
// Shared by every "Why this?" panel, so the working reads the same wherever advice is given.

export type WorkingLine = {
  label: string;
  value: string;
  /** The answer the lines above add up to. Set apart visually. */
  result?: boolean;
};

export type WorkingGroup = {
  title: string;
  lines: WorkingLine[];
  /** Where the figure comes from, when it is not worked out from others. */
  note?: string;
};
