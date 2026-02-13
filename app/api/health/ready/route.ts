import { NextResponse } from "next/server";
import { callServiceJson, type ServiceName } from "@/lib/microservices/proxy";

export async function GET() {
  const services: ServiceName[] = ["auth", "dashboard", "identity", "debts", "rehab", "help", "pdf"];

  // Why: readiness verifies every backing microservice before the web gateway reports healthy.
  const checks = await Promise.all(
    services.map(async (service) => {
      const result = await callServiceJson(service, "/health/ready", { method: "GET" });
      return {
        service,
        status: result.status
      };
    })
  );

  const allReady = checks.every((item) => item.status >= 200 && item.status < 300);
  if (allReady) {
    return NextResponse.json({ status: "ready", checks });
  }

  return NextResponse.json({ status: "not_ready", checks }, { status: 503 });
}
