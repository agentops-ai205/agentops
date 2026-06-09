import { buildApp, bootstrapApplication } from "../../apps/api/src/app";

type HeaderValue = string | number | string[] | undefined;

interface NetlifyEvent {
  httpMethod: string;
  path: string;
  rawQuery?: string;
  queryStringParameters?: Record<string, string | null>;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
}

let appPromise: ReturnType<typeof buildApp> | undefined;
let bootstrapPromise: Promise<unknown> | undefined;

async function getApp() {
  if (!appPromise) {
    appPromise = buildApp();
  }

  const app = await appPromise;
  await app.ready();
  return app;
}

export async function handler(event: NetlifyEvent) {
  const path = normalizePath(event.path);
  const app = await getApp();

  if (shouldBootstrap(path)) {
    await ensureBootstrapped();
  }

  const response = await app.inject({
    method: event.httpMethod,
    url: `${path}${queryString(event)}`,
    headers: event.headers,
    payload: payloadFromEvent(event)
  });

  return {
    statusCode: response.statusCode,
    headers: headersFromFastify(response.headers),
    body: response.body,
    isBase64Encoded: false
  };
}

async function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapApplication({
      runMigrations: process.env.AGENTOPS_AUTO_MIGRATE !== "false",
      initializeKernelFiles: false,
      seed: process.env.AGENTOPS_AUTO_SEED !== "false"
    });
  }

  await bootstrapPromise;
}

function shouldBootstrap(path: string) {
  return path !== "/live";
}

function normalizePath(path: string) {
  for (const prefix of ["/.netlify/functions/api", "/api"]) {
    if (path === prefix) return "/";
    if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  }
  return path || "/";
}

function queryString(event: NetlifyEvent) {
  if (event.rawQuery) return `?${event.rawQuery}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== null) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

function payloadFromEvent(event: NetlifyEvent) {
  if (!event.body || event.httpMethod === "GET" || event.httpMethod === "HEAD") {
    return undefined;
  }

  return event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;
}

function headersFromFastify(headers: Record<string, HeaderValue>) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    normalized[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  return normalized;
}
