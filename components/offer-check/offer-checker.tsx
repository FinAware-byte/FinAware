"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/common/card";
import { WorkingTable } from "@/components/common/working-table";
import {
  NCA_LIMITS,
  checkOffer,
  creditTypeLabel,
  offerInputFrom,
  parseOffer,
  type CreditType,
  type OfferVerdict
} from "@/lib/finance/offer-check";
import { cn } from "@/lib/utils";

// Paste the message; the figures fill in from it and stay editable. Everything runs in the
// browser — the pasted text is never sent anywhere or stored.

const EXAMPLES: Array<{ label: string; text: string }> = [
  {
    label: "Loan-shark SMS",
    text: "Need cash fast? Borrow R1 000 today, pay back R1 500 at month end. No credit check, blacklisted welcome! WhatsApp 071 234 5678"
  },
  {
    label: "Upfront-fee scam",
    text: "Congratulations! Your loan of R50 000 is approved. Pay a R750 admin fee via e-wallet to release the funds within 24 hours."
  },
  {
    label: "Registered lender",
    text: "QuickCash (NCRCP1234): borrow R1 000 for 30 days, repay R1 300."
  }
];

const verdictTone: Record<OfferVerdict, { card: string; chip: string; label: string }> = {
  scam: { card: "border-rose-300 bg-rose-50/60", chip: "bg-rose-600 text-white", label: "Likely scam" },
  over_limit: { card: "border-rose-300 bg-rose-50/60", chip: "bg-rose-600 text-white", label: "Illegal cost" },
  caution: { card: "border-amber-200 bg-amber-50/50", chip: "bg-amber-500 text-white", label: "Be careful" },
  no_flags: { card: "border-emerald-200 bg-emerald-50/40", chip: "bg-emerald-600 text-white", label: "No warning signs" },
  need_info: { card: "border-slate-200", chip: "bg-slate-500 text-white", label: "Needs the figures" }
};

const CREDIT_TYPES: CreditType[] = ["short_term", "unsecured", "credit_facility", "other", "mortgage"];

const fieldClass =
  "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500";

type Fields = {
  amount: string;
  schedule: "once" | "monthly";
  repay: string;
  months: string;
  creditType: CreditType;
};

function fieldsFrom(text: string, previous: Fields): Fields {
  const parsed = parseOffer(text);
  const input = offerInputFrom(parsed);
  return {
    amount: parsed.amount !== null ? String(parsed.amount) : previous.amount,
    schedule: parsed.instalment !== null ? "monthly" : parsed.repayTotal !== null || parsed.statedRate ? "once" : previous.schedule,
    repay:
      parsed.instalment !== null
        ? String(parsed.instalment)
        : input?.repayTotal != null
          ? String(Math.round(input.repayTotal * 100) / 100)
          : previous.repay,
    months: input?.termMonths != null ? String(input.termMonths) : previous.months,
    creditType: input?.creditType ?? parsed.creditType ?? previous.creditType
  };
}

const EMPTY: Fields = { amount: "", schedule: "once", repay: "", months: "", creditType: "short_term" };

export function OfferChecker({ repoRatePercent }: { repoRatePercent: number }) {
  const [text, setText] = useState("");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [understood, setUnderstood] = useState<string[]>([]);

  function readMessage(value: string) {
    setText(value);
    setUnderstood(parseOffer(value).understood);
    setFields((previous) => fieldsFrom(value, previous));
  }

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => setFields((previous) => ({ ...previous, [key]: value }));

  const result = useMemo(() => {
    if (!text.trim() && !fields.amount) return null;
    const repay = Number(fields.repay);
    return checkOffer(
      {
        amount: Number(fields.amount) || 0,
        repayTotal: fields.schedule === "once" && repay > 0 ? repay : null,
        instalment: fields.schedule === "monthly" && repay > 0 ? repay : null,
        termMonths: Number(fields.months) || 0,
        creditType: fields.creditType,
        text
      },
      repoRatePercent
    );
  }, [text, fields, repoRatePercent]);

  return (
    <div className="space-y-4">
      <Card>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Paste the SMS, WhatsApp message or loan offer</span>
          <textarea
            value={text}
            onChange={(event) => readMessage(event.target.value)}
            rows={4}
            placeholder="e.g. Borrow R1 000 today, pay back R1 500 at month end…"
            className={cn(fieldClass, "resize-y")}
          />
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {understood.length > 0 ? (
            <>
              <span className="text-slate-500">Read as:</span>
              {understood.map((words) => (
                <span key={words} className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700 ring-1 ring-brand-200">
                  {words}
                </span>
              ))}
            </>
          ) : (
            <>
              <span className="text-slate-500">Try an example:</span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => readMessage(example.text)}
                  className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-200"
                >
                  {example.label}
                </button>
              ))}
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-slate-500">Checked on this device. The message is not sent anywhere or saved.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">You borrow (R)</span>
            <input type="number" min="0" inputMode="decimal" value={fields.amount} onChange={(e) => set("amount", e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">You pay back</span>
            <select value={fields.schedule} onChange={(e) => set("schedule", e.target.value as Fields["schedule"])} className={fieldClass}>
              <option value="once">In one payment</option>
              <option value="monthly">Every month</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">{fields.schedule === "once" ? "Total paid back (R)" : "Each month (R)"}</span>
            <input type="number" min="0" inputMode="decimal" value={fields.repay} onChange={(e) => set("repay", e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Over (months)</span>
            <input type="number" min="0" step="0.5" inputMode="decimal" value={fields.months} onChange={(e) => set("months", e.target.value)} className={fieldClass} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Type of credit</span>
            <select value={fields.creditType} onChange={(e) => set("creditType", e.target.value as CreditType)} className={fieldClass}>
              {CREDIT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {creditTypeLabel(type)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Card>

      {result && (
        <>
          <Card className={verdictTone[result.verdict].card}>
            <span className={cn("inline-block rounded-full px-2.5 py-1 text-xs font-semibold", verdictTone[result.verdict].chip)}>
              {verdictTone[result.verdict].label}
            </span>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{result.headline}</h2>
            <p className="mt-1 max-w-prose text-sm text-slate-700">{result.summary}</p>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="text-lg font-semibold text-slate-900">Warning signs</h3>
              {result.flags.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">None of the usual warning signs are in the wording.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {result.flags.map((flag) => (
                    <li
                      key={flag.key}
                      className={cn(
                        "rounded-lg border p-3",
                        flag.severity === "scam" ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60"
                      )}
                    >
                      <p className="text-sm font-semibold text-slate-900">{flag.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{flag.why}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Because it says: <span className="font-medium text-slate-700">&ldquo;{flag.words}&rdquo;</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="text-sm font-semibold text-slate-900">NCR registration</p>
                {result.ncrNumber ? (
                  <p className="mt-1 text-sm text-slate-700">
                    The offer quotes <span className="font-mono font-semibold">{result.ncrNumber}</span>. Check it on the{" "}
                    <a
                      href="https://www.ncr.org.za"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      National Credit Regulator&apos;s register
                    </a>{" "}
                    and make sure the name matches — scammers copy real numbers.
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-amber-800">
                    No registration number (NCRCP…) in the offer. Every lender registered with the National Credit
                    Regulator has one and must show it. Ask for it before you sign.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <h3 className="text-lg font-semibold text-slate-900">What it costs, against the law</h3>
              {result.cost ? (
                <>
                  <p className="mb-3 mt-1 text-sm text-slate-600">
                    The most a registered lender may charge for the same amount and term: interest at the cap for a{" "}
                    {creditTypeLabel(fields.creditType).toLowerCase()} ({result.cost.capLabel}), plus the largest fees
                    allowed.
                  </p>
                  <WorkingTable lines={result.cost.working} />
                  <p className="mt-2 text-xs text-slate-500">
                    That is {result.cost.costPerMonthPercent.toFixed(1)}% of what you borrow, every month.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">Fill in what you borrow, what you pay back and over how long.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <Card>
        <h3 className="text-lg font-semibold text-slate-900">Whatever the check says</h3>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          <li>Never pay a fee before a loan is paid out.</li>
          <li>Never hand over your ID, bank card, SASSA card or PIN, and never share a one-time code.</li>
          <li>Get the agreement in writing, with the total cost, before you sign.</li>
          <li>Report illegal lenders and threats to the National Credit Regulator at ncr.org.za.</li>
        </ul>
      </Card>

      <p className="text-xs text-slate-500">
        Limits from the {NCA_LIMITS.source}, using a repo rate of {repoRatePercent.toFixed(2)}%. Short-term loans are
        checked against the 5% a month cap for a first loan; later loans in the same year are capped at 3%. A screen, not
        legal advice.
      </p>
    </div>
  );
}
