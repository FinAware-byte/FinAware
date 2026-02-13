import express, { type Express } from "express";
import { prisma } from "../../lib/db/prisma";

export function createServiceApp(serviceName: string): Express {
  const app = express();
  app.use(express.json());

  app.get("/health/live", (_request, response) => {
    response.json({ status: "ok", service: serviceName });
  });

  app.get("/health/ready", async (_request, response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      response.json({ status: "ready", service: serviceName });
    } catch {
      response.status(503).json({ status: "not-ready", service: serviceName });
    }
  });

  return app;
}

export function resolvePort(rawPort: string | undefined, fallbackPort: number): number {
  const parsed = Number(rawPort);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallbackPort;
  return parsed;
}
