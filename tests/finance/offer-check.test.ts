import assert from "node:assert/strict";
import { test } from "node:test";
import { NCA_LIMITS, checkOffer, interestCap, offerInputFrom, parseOffer } from "../../lib/finance/offer-check";

const REPO = 7;
const plain = (text: string) => text.replace(/ /g, " ");

function check(text: string) {
  const parsed = parseOffer(text);
  const input = offerInputFrom(parsed);
  return { parsed, input, result: checkOffer({ ...(input ?? { amount: 0, repayTotal: null, instalment: null, termMonths: 0, creditType: "short_term" }), text }, REPO) };
}

test("a classic loan-shark SMS is over the legal maximum, and says by how much", () => {
  const { parsed, input, result } = check(
    "Need cash fast? Borrow R1 000 today, pay back R1 500 at month end. No credit check, blacklisted welcome! WhatsApp 071 234 5678"
  );
  assert.equal(parsed.amount, 1000);
  assert.equal(parsed.repayTotal, 1500);
  assert.equal(parsed.termMonths, 1);
  assert.equal(input?.creditType, "short_term", "R1 000 for a month is short-term credit under the Act");

  // Most a registered lender may charge: 5% interest (R50) + initiation R165 + VAT (R189.75)
  // + one month's R60 service fee + VAT (R69) = R308.75, so R1 308.75 back at most.
  assert.ok(Math.abs(result.cost!.legalMaxTotal - 1308.75) < 0.01, String(result.cost!.legalMaxTotal));
  assert.ok(Math.abs(result.cost!.excess - 191.25) < 0.01);
  assert.equal(result.verdict, "over_limit");
  assert.match(plain(result.summary), /R 191,25 more than a registered lender may charge/);
  assert.deepEqual(result.flags.map((f) => f.key).sort(), ["no_credit_check", "personal_contact"]);
});

test("what a typical registered micro-lender charges is within the law", () => {
  // R1 300 back on R1 000 for 30 days sits just under the R1 308.75 ceiling worked out above.
  const { result } = check("QuickCash (NCRCP1234): borrow R1 000 for 30 days, repay R1 300.");
  assert.equal(result.verdict, "no_flags");
  assert.equal(result.ncrNumber, "NCRCP1234");
  assert.ok(result.cost!.excess < 0);
  assert.match(result.summary, /check NCRCP1234 on the National Credit Regulator's register/);
});

test("an advance-fee scam is called a scam whatever the numbers say", () => {
  const { result } = check(
    "Congratulations! Your loan of R50 000 is approved. Pay a R750 admin fee via e-wallet to release the funds within 24 hours."
  );
  assert.equal(result.verdict, "scam");
  const keys = result.flags.map((f) => f.key);
  assert.ok(keys.includes("upfront_fee"));
  assert.ok(keys.includes("odd_payment"));
  assert.ok(keys.includes("pressure"));
});

test("a lender keeping your card or asking for your PIN is flagged as illegal", () => {
  assert.equal(check("We keep your SASSA card until the loan is paid. R500 now, R800 back on payday.").result.verdict, "scam");
  assert.equal(check("Send us the OTP we just sent to confirm your R2 000 loan").result.flags[0].key, "otp");
});

test("each flag shows the words that triggered it, so a false alarm can be seen for what it is", () => {
  const { result } = check("Borrow R1 000, repay R1 250 in 30 days. Blacklisted welcome.");
  const flag = result.flags.find((f) => f.key === "no_credit_check")!;
  assert.equal(flag.words, "Blacklisted welcome");
});

test("a flat rate with no period is read the way loan sharks quote it", () => {
  const { parsed, input, result } = check("Get R2 000 at 50% interest, pay at month end");
  assert.deepEqual(parsed.statedRate, { percent: 50, per: "term" });
  assert.equal(input?.repayTotal, 3000);
  assert.equal(result.verdict, "over_limit");
});

test("instalment loans are compared with an amortised loan at the cap, fees financed", () => {
  // Unsecured cap: repo 7% + 21% = 28% a year.
  assert.equal(interestCap("unsecured", REPO).label, "28.00% a year (repo 7.00% + 21%)");

  const fair = check("Personal loan of R20 000 over 24 months at R1 150 per month");
  assert.equal(fair.parsed.instalment, 1150);
  assert.equal(fair.input?.creditType, "unsecured", "R20 000 is above the R8 000 short-term limit");
  assert.ok(fair.result.cost!.excess < 0, `R27 600 should be under the ceiling, got ${fair.result.cost!.legalMaxTotal}`);
  assert.equal(fair.result.verdict, "caution", "no NCR number on the offer");

  const steep = check("Loan of R10 000 over 12 months at R1 500 per month");
  assert.equal(steep.result.verdict, "over_limit");
});

test("the short-term definition follows the Act: at most R8 000, within six months", () => {
  const within = offerInputFrom(parseOffer("Borrow R8 000, repay R9 500 in 6 months"));
  const over = offerInputFrom(parseOffer("Borrow R9 000, repay R10 500 in 6 months"));
  assert.equal(within?.creditType, "short_term");
  assert.equal(over?.creditType, "unsecured");
  assert.equal(NCA_LIMITS.shortTerm.maxAmount, 8000);
});

test("a home loan is never called illegal on fee caps this check does not carry", () => {
  const { result } = check("Home loan: borrow R100 000, repay R200 000 over 12 months");
  assert.notEqual(result.verdict, "over_limit");
});

test("without the figures the check asks for them rather than guessing", () => {
  const { result } = check("Loans available, call us");
  assert.equal(result.verdict, "need_info");
  assert.equal(result.cost, null);
});

test("the working shows every legal charge that makes up the ceiling", () => {
  const { result } = check("Borrow R1 000, pay back R1 500 at month end");
  const labels = result.cost!.working.map((line) => line.label);
  assert.ok(labels.some((l) => l.startsWith("Most interest allowed (5% a month)")));
  assert.ok(labels.includes("+ Most initiation fee allowed, with VAT"));
  assert.ok(labels.some((l) => l.startsWith("+ Most service fees allowed")));
  assert.equal(labels.at(-1), "Over the legal maximum by");
});
