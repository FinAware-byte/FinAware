// The peer-group answer as the ML service returns it (ml-service/ml/segments.py, Segmenter.assign).

export type PeerMetric = {
  key: "income" | "expense_ratio" | "repayment_ratio" | "surplus_ratio" | "savings_months" | "credit_score";
  label: string;
  higherIsBetter: boolean;
  you: number;
  groupMedian: number;
  groupP25: number;
  groupP75: number;
  /** Share of the group below this user, 0–100. */
  percentile: number;
  /** Beyond every member of the group, so a percentile would mislead. */
  outsideGroup: boolean;
  /** Median among members with at least 10% of income left each month. */
  comfortableMedian: number | null;
};

export type PeerSegment = {
  available: true;
  segment: { id: number; name: string; size: number; share: number; withLoanShare: number; comfortableShare: number };
  /** False when this profile is further from the group's centre than 95% of its members. */
  typical: boolean;
  metrics: PeerMetric[];
  model: {
    name: string;
    version: string;
    k: number;
    silhouette: number;
    recordsUsed: number;
    recordsExcluded: number;
    comfortableRule: string;
  };
};

export type PeerSegmentResponse = PeerSegment | { available: false; reason: "PROFILE_REQUIRED" };
