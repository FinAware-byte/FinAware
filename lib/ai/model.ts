// One way to ask the language model, shared by every feature that uses it.
//
// The rules every caller gets for free:
//   * No key, no call. The calculated answer is the product; the model only words it better.
//   * Every failure — no credit, a timeout, malformed JSON, a schema mismatch — returns a reason
//     instead of throwing, and is logged, because a silent fallback looks exactly like a working
//     feature and makes "the key does nothing" impossible to diagnose.
//   * Output is strict JSON against a schema, then validated again in code.
//   * figuresAllowed(): money in an answer must be money FinAware calculated. A model that invents
//     a rand amount in financial guidance is worse than no model.

export type ModelContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string }
  | { type: "input_file"; filename: string; file_data: string };

export type ModelRequest<T> = {
  /** For the log line: which feature asked. */
  task: string;
  system: string;
  user: string | ModelContent[];
  schema: { name: string; schema: Record<string, unknown> };
  /** Second check after the API's own schema enforcement. Return null to reject. */
  validate: (value: unknown) => T | null;
  timeoutMs?: number;
  /** Injected in tests; the real fetch otherwise. */
  fetchImpl?: typeof fetch;
};

export type ModelResult<T> = { ok: true; value: T; model: string } | { ok: false; reason: string };

export function modelConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

// After the API says the account has no credit or the key is wrong, asking again only makes each
// feature wait for the same refusal — measured at seven seconds for one suggestion. So those two
// answers pause every call for a while; anything else (a timeout, a bad reply) does not.
const PAUSE_MS = 10 * 60 * 1000;
let pausedUntil = 0;
let pauseReason = "";

/** For callers that make their own request (the dashboard recommendations): is the model paused? */
export function modelPausedReason(): string | null {
  return Date.now() < pausedUntil ? pauseReason : null;
}

/** For callers that make their own request: record a refusal that should pause every caller. */
export function noteModelRefusal(status: number, errorType: string | undefined): void {
  if (status === 401 || errorType === "insufficient_quota") {
    pausedUntil = Date.now() + PAUSE_MS;
    pauseReason = `OpenAI returned ${status}${errorType ? ` (${errorType})` : ""}; not asking again for ${PAUSE_MS / 60000} minutes`;
  }
}

/** For tests: forget any pause. */
export function resetModelPause(): void {
  pausedUntil = 0;
  pauseReason = "";
}

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

/**
 * The Responses API returns its text inside `output[].content[].text`. `output_text` is a
 * convenience the official SDKs add, and is not always present on the raw HTTP response — so
 * reading only that field would silently discard a perfectly good reply.
 */
export function extractOutputText(payload: ResponsesPayload): string | null {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const chunks = (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((part) => part.text)
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0);

  return chunks.length > 0 ? chunks.join("") : null;
}

export async function askModel<T>(request: ModelRequest<T>): Promise<ModelResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: "no language model is configured" };

  if (Date.now() < pausedUntil) return { ok: false, reason: pauseReason };

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  const fail = (reason: string): ModelResult<T> => {
    console.warn(`[model:${request.task}] using the calculated answer: ${reason}`);
    return { ok: false, reason };
  };

  try {
    const response = await (request.fetchImpl ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ],
        text: { format: { type: "json_schema", name: request.schema.name, strict: true, schema: request.schema.schema } }
      })
    });

    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { error?: { type?: string; message?: string } };
      noteModelRefusal(response.status, detail.error?.type);
      return fail(`OpenAI returned ${response.status}${detail.error?.type ? ` (${detail.error.type})` : ""}`);
    }

    const text = extractOutputText((await response.json()) as ResponsesPayload);
    if (!text) return fail("the response carried no output text");

    let candidate: unknown;
    try {
      candidate = JSON.parse(text);
    } catch {
      return fail("the model did not return valid JSON");
    }

    const value = request.validate(candidate);
    if (value === null) return fail("the model's answer did not pass validation");
    return { ok: true, value, model };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "the request failed");
  }
}

// ---------------------------------------------------------------------------------------------
// The figures guardrail.

/** Every rand amount in a piece of text, as numbers: "R 1 234,56", "R1,234.56", "R1234" → 1234.56 … */
export function randAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(/R\s?(\d{1,3}(?:[\s ,]\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/g)) {
    const whole = Number(match[1].replace(/[\s ,]/g, ""));
    amounts.push(match[2] ? Number(`${whole}.${match[2]}`) : whole);
  }
  return amounts;
}

/**
 * True when every rand amount in `answer` appears among `known` — the figures FinAware worked
 * out and gave the model. A rounding of a known figure to the nearest rand is allowed, since
 * "R1 312" for R1 312.29 is the same figure; anything else is a number the model made up.
 */
export function figuresAllowed(answer: string, known: number[]): boolean {
  return randAmounts(answer).every((amount) =>
    known.some((figure) => Math.abs(figure - amount) < 0.005 || Math.abs(Math.round(figure) - amount) < 0.005)
  );
}
