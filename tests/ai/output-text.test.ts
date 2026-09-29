import assert from "node:assert/strict";
import { test } from "node:test";
import { extractOutputText } from "../../lib/ai/recommendations";

// The Responses API puts its text in output[].content[].text. `output_text` is a convenience the
// SDKs add and is not guaranteed on the raw HTTP response, so reading only that field would throw
// away a valid reply and silently fall back to the calculated text.

test("uses output_text when the API provides it", () => {
  assert.equal(extractOutputText({ output_text: '{"ok":true}' }), '{"ok":true}');
});

test("falls back to the output array the raw API actually returns", () => {
  const payload = {
    output: [{ content: [{ type: "output_text", text: '{"summary":"hello"}' }] }]
  };
  assert.equal(extractOutputText(payload), '{"summary":"hello"}');
});

test("joins text split across several content parts", () => {
  const payload = {
    output: [{ content: [{ text: '{"a":' }, { text: "1}" }] }]
  };
  assert.equal(extractOutputText(payload), '{"a":1}');
});

test("an empty output_text does not mask a usable output array", () => {
  const payload = {
    output_text: "   ",
    output: [{ content: [{ text: '{"real":true}' }] }]
  };
  assert.equal(extractOutputText(payload), '{"real":true}');
});

test("returns null when there is genuinely nothing to read", () => {
  assert.equal(extractOutputText({}), null);
  assert.equal(extractOutputText({ output: [] }), null);
  assert.equal(extractOutputText({ output: [{ content: [] }] }), null);
});
