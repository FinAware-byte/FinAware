import type { NextFunction, Request, RequestHandler, Response } from "express";

// Why: Express 4 does not catch rejected promises from async handlers; without this an unexpected
// database error would crash the service instead of returning a structured error.
export function asyncRoute(
  serviceName: string,
  handler: (request: Request, response: Response) => Promise<void>
): RequestHandler {
  return (request: Request, response: Response, _next: NextFunction) => {
    handler(request, response).catch((error: unknown) => {
      console.error(`[${serviceName}] ${request.method} ${request.path} failed`, error);
      if (!response.headersSent) {
        response.status(500).json({ error: "INTERNAL_ERROR", message: "Unexpected service error" });
      }
    });
  };
}
