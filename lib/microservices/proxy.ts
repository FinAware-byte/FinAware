export type ServiceName = "auth" | "dashboard" | "identity" | "debts" | "rehab" | "help" | "pdf";

const serviceEnvMap: Record<ServiceName, string> = {
  auth: "AUTH_SERVICE_URL",
  dashboard: "DASHBOARD_SERVICE_URL",
  identity: "IDENTITY_SERVICE_URL",
  debts: "DEBTS_SERVICE_URL",
  rehab: "REHAB_SERVICE_URL",
  help: "HELP_SERVICE_URL",
  pdf: "PDF_SERVICE_URL"
};

const serviceDefaultMap: Record<ServiceName, string> = {
  auth: "http://127.0.0.1:4101",
  dashboard: "http://127.0.0.1:4102",
  identity: "http://127.0.0.1:4103",
  debts: "http://127.0.0.1:4104",
  rehab: "http://127.0.0.1:4105",
  help: "http://127.0.0.1:4106",
  pdf: "http://127.0.0.1:4107"
};

function serviceUrl(name: ServiceName): string {
  return process.env[serviceEnvMap[name]] ?? serviceDefaultMap[name];
}

export async function callService(name: ServiceName, path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = serviceUrl(name);
  const headers = new Headers(init?.headers);

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });
}

export async function callServiceJson(name: ServiceName, path: string, init?: RequestInit): Promise<{
  status: number;
  payload: unknown;
}> {
  try {
    const response = await callService(name, path, init);
    const text = await response.text();

    let payload: unknown = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }

    return {
      status: response.status,
      payload
    };
  } catch {
    return {
      status: 503,
      payload: { message: `${name} service unavailable` }
    };
  }
}
