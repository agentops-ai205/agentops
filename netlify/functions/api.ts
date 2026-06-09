import { buildApp, bootstrapApplication } from "../../apps/api/src/app";
import type { FastifyInstance } from "fastify";

type HeaderValue = string | number | string[] | undefined;

interface NetlifyEvent {
  httpMethod: string;
  path: string;
  rawQuery?: string;
  queryStringParameters?: Record<string, string | null>;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  blobs?: string;
  isBase64Encoded?: boolean;
}

let appPromise: Promise<FastifyInstance> | undefined;
let bootstrapPromise: Promise<unknown> | undefined;

async function getApp(event: NetlifyEvent) {
  await connectNetlifyBlobContext(event);

  if (!appPromise) {
    appPromise = usesNetlifyBlobStorage()
      ? import("../../apps/api/src/localServer").then((module) => module.prepareLocalApp())
      : buildApp();
  }

  const app = await appPromise;
  await app.ready();
  return app;
}

export async function handler(event: NetlifyEvent) {
  const path = normalizePath(event.path);
  const app = await getApp(event);

  if (!usesNetlifyBlobStorage() && shouldBootstrap(path)) {
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

function usesNetlifyBlobStorage() {
  return process.env.AGENTOPS_STORAGE_ENGINE === "netlify_blobs";
}

async function connectNetlifyBlobContext(event: NetlifyEvent) {
  if (!usesNetlifyBlobStorage() || !event.blobs) return;
  const { connectLambda } = await import("@netlify/blobs");
  connectLambda({ blobs: event.blobs, headers: event.headers ?? {} });
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
