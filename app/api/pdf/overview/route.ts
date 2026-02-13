import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callService } from "@/lib/microservices/proxy";
import { pdfPasswordSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as unknown;
  const parsed = pdfPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid password input" }, { status: 400 });
  }

  let response: Response;
  try {
    response = await callService("pdf", `/pdf/overview/${userId}`, {
      method: "POST",
      body: JSON.stringify(parsed.data)
    });
  } catch {
    return NextResponse.json({ message: "PDF service unavailable" }, { status: 503 });
  }

  if (!response.ok) {
    const text = await response.text();
    let message = "Unable to generate PDF overview";
    if (text) {
      try {
        const payload = JSON.parse(text) as { message?: string };
        message = payload.message ?? message;
      } catch {
        message = text;
      }
    }
    return NextResponse.json({ message }, { status: response.status });
  }

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: response.status,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=finaware-overview.pdf"
    }
  });
}
