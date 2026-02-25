import { NextResponse } from "next/server";
import {
  FICA_REQUIRED_COOKIE_NAME,
  FICA_VERIFIED_COOKIE_NAME,
  buildFicaRequiredCookieOptions,
  getSessionUserId,
  buildFicaCookieOptions
} from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";

const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
const maxFileSizeBytes = 8 * 1024 * 1024;

function parseFileEntry(value: FormDataEntryValue | null): {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
} | null {
  if (!value || typeof value === "string") return null;
  if (!value.name || value.size <= 0) return null;
  return {
    fileName: value.name,
    mimeType: value.type || "application/octet-stream",
    sizeBytes: value.size
  };
}

function validateFile(
  file:
    | {
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      }
    | null,
  label: string
): string | null {
  if (!file) return `${label} is required.`;
  if (!allowedMimeTypes.includes(file.mimeType)) {
    return `${label} must be a PDF, JPG, or PNG file.`;
  }
  if (file.sizeBytes > maxFileSizeBytes) {
    return `${label} must be 8MB or smaller.`;
  }
  return null;
}

export async function POST(request: Request) {
  const sessionUserId = getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const useDemoPlaceholder = String(formData.get("useDemoPlaceholder") ?? "") === "on";
  const identityDocument = useDemoPlaceholder
    ? {
        fileName: "demo-id-placeholder.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      }
    : parseFileEntry(formData.get("identityDocument"));
  const proofOfAddress = useDemoPlaceholder
    ? {
        fileName: "demo-proof-of-address-placeholder.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1024
      }
    : parseFileEntry(formData.get("proofOfAddress"));
  const bankStatement = useDemoPlaceholder
    ? null
    : parseFileEntry(formData.get("bankStatement"));
  const consentAccepted = String(formData.get("consentAccepted") ?? "") === "on";

  if (!useDemoPlaceholder) {
    const identityError = validateFile(identityDocument, "Identity document");
    if (identityError) {
      return NextResponse.json({ message: identityError }, { status: 400 });
    }

    const addressError = validateFile(proofOfAddress, "Proof of address");
    if (addressError) {
      return NextResponse.json({ message: addressError }, { status: 400 });
    }

    if (bankStatement) {
      const bankStatementError = validateFile(bankStatement, "Bank statement");
      if (bankStatementError) {
        return NextResponse.json({ message: bankStatementError }, { status: 400 });
      }
    }
  }

  if (!consentAccepted) {
    return NextResponse.json(
      { message: "You must provide consent to complete FICA verification." },
      { status: 400 }
    );
  }

  const result = await callServiceJson("auth", "/auth/fica/verify", {
    method: "POST",
    body: JSON.stringify({
      userId: sessionUserId,
      consentAccepted,
      useDemoPlaceholder,
      identityDocument,
      proofOfAddress,
      bankStatement
    })
  });

  if (result.status < 200 || result.status >= 300) {
    return NextResponse.json(result.payload, { status: result.status });
  }

  const response = NextResponse.json(result.payload);
  response.cookies.set(FICA_VERIFIED_COOKIE_NAME, "1", buildFicaCookieOptions(60 * 60 * 24 * 7));
  response.cookies.set(FICA_REQUIRED_COOKIE_NAME, "0", buildFicaRequiredCookieOptions(60 * 60 * 24 * 7));
  return response;
}
