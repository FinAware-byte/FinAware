import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session";
import { callServiceJson } from "@/lib/microservices/proxy";
import { updateDebtSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = getSessionUserId();
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const json = (await request.json()) as unknown;
  const parsed = updateDebtSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Invalid update payload" }, { status: 400 });
  }

  const result = await callServiceJson("debts", `/debts/${userId}/${params.id}`, {
    method: "PATCH",
    body: JSON.stringify(parsed.data)
  });
  return NextResponse.json(result.payload, { status: result.status });
}
