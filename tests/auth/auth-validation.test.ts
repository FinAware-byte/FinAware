import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
import { isValidPassportForCountry } from "../../lib/identification/rules";
import { authLoginSchema, ficaVerificationSchema } from "../../lib/validation";

test("valid South African ID and password are accepted", () => {
  const result = authLoginSchema.safeParse({
    idNumberOrPassport: "8005258445999",
    documentType: "SA_ID",
    password: "Correct-Horse-Battery-9"
  });
  assert.ok(result.success);
});

test("invalid South African ID checksum is rejected", () => {
  const result = authLoginSchema.safeParse({
    idNumberOrPassport: "8005258445990",
    documentType: "SA_ID",
    password: "Correct-Horse-Battery-9"
  });
  assert.ok(!result.success);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === "idNumberOrPassport"));
});

test("passport format is checked against selected country", () => {
  assert.equal(isValidPassportForCountry("FN204999", "ZW"), true);
  assert.equal(
    authLoginSchema.safeParse({
      idNumberOrPassport: "FN204999",
      documentType: "PASSPORT",
      passportCountry: "ZW",
      password: "Correct-Horse-Battery-9"
    }).success,
    true
  );
  assert.equal(
    authLoginSchema.safeParse({
      idNumberOrPassport: "not-valid",
      documentType: "PASSPORT",
      passportCountry: "ZW",
      password: "Correct-Horse-Battery-9"
    }).success,
    false
  );
});

test("password must be at least 12 characters", () => {
  const result = authLoginSchema.safeParse({
    idNumberOrPassport: "8005258445999",
    documentType: "SA_ID",
    password: "short"
  });
  assert.ok(!result.success);
});

test("password hashing never stores the original password and verifies safely", () => {
  const password = "Correct-Horse-Battery-9";
  const hash = hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(verifyPassword(password, hash), true);
  assert.equal(verifyPassword("Wrong-password-123", hash), false);
});

test("FICA verification requires both terms and privacy acknowledgements", () => {
  const file = { fileName: "demo.pdf", mimeType: "application/pdf", sizeBytes: 1024 };
  const common = {
    useDemoPlaceholder: true,
    identityDocument: file,
    proofOfAddress: file,
    bankStatement: null
  };
  assert.equal(ficaVerificationSchema.safeParse({ ...common, termsAccepted: true }).success, false);
  assert.equal(ficaVerificationSchema.safeParse({ ...common, privacyAccepted: true }).success, false);
  assert.equal(
    ficaVerificationSchema.safeParse({ ...common, termsAccepted: true, privacyAccepted: true }).success,
    true
  );
});
