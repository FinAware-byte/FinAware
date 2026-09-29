import assert from "node:assert/strict";
import { test } from "node:test";
import { greetingFor, pressureFor } from "../../components/dashboard/month-bar";

test("the greeting follows the time of day", () => {
  assert.equal(greetingFor(new Date("2026-09-24T08:00:00")), "Good morning");
  assert.equal(greetingFor(new Date("2026-09-24T13:00:00")), "Good afternoon");
  assert.equal(greetingFor(new Date("2026-09-24T19:00:00")), "Good evening");
});

test("the wording escalates with how much of the month debt takes", () => {
  assert.match(pressureFor(20).label, /still leave room/);
  assert.match(pressureFor(45).label, /large share/);
  assert.match(pressureFor(75).label, /already spoken for/);
});

test("the boundaries land on the heavier wording, not the lighter one", () => {
  // Exactly 40% and 60% are the thresholds; a user on the line should not be told it is fine.
  assert.match(pressureFor(40).label, /large share/);
  assert.match(pressureFor(60).label, /already spoken for/);
  assert.match(pressureFor(39.9).label, /still leave room/);
});

test("colour tracks the wording, so the bar never contradicts the sentence", () => {
  assert.equal(pressureFor(75).bar, "bg-rose-500");
  assert.equal(pressureFor(45).bar, "bg-amber-500");
  assert.equal(pressureFor(10).bar, "bg-brand-600");
});
