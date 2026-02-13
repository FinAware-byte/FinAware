"use client";

import { useEffect, useState } from "react";
import type { AiRecommendationsResponse } from "@/types/ai";
import { Card } from "@/components/common/card";

type Props = {
  title?: string;
  compact?: boolean;
  requestBody?: Record<string, unknown>;
};

export function AiRecommendationsCard({
  title = "How to improve your score",
  compact = false,
  requestBody
}: Props) {
  const [data, setData] = useState<AiRecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestBodyJson = JSON.stringify(requestBody ?? {});

  useEffect(() => {
    const run = async () => {
      try {
        const response = await fetch("/api/ai-recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestBodyJson
        });
        if (!response.ok) {
          throw new Error("Unable to load recommendations.");
        }

        const payload = (await response.json()) as AiRecommendationsResponse;
        setData(payload);
      } catch {
        setError("Unable to load recommendations right now.");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [requestBodyJson]);

  return (
    <Card className={compact ? "max-h-[560px] overflow-auto" : undefined}>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {loading && <p className="mt-3 text-sm text-slate-500">Loading recommendations...</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {data && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-700">{data.summary}</p>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Top actions</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {data.top_actions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-slate-900">Warnings</h4>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
              {data.warnings.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
