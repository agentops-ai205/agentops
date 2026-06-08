import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export interface HttpSecurityOptions {
  appEnv: string;
  allowedOrigins: string[];
  operatorToken?: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
}

export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  appEnv: string
) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return appEnv !== "production" && allowedOrigins.length === 0;
}

export function isOperatorAuthorized(
  headers: Record<string, string | string[] | undefined>,
  operatorToken?: string
) {
  if (!operatorToken) return true;
  const authorization = headerValue(headers.authorization);
  const tokenHeader = headerValue(headers["x-agentops-operator-token"]);
  return authorization === `Bearer ${operatorToken}` || tokenHeader === operatorToken;
}

export function shouldBypassOperatorAuth(method: string, url: string) {
  if (method === "OPTIONS") return true;
  return ["/live", "/ready", "/health"].some((path) => url === path || url.startsWith(`${path}?`));
}

export function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-resource-policy": "same-site"
  };
}

export function configureHttpSecurity(app: FastifyInstance, options: HttpSecurityOptions) {
  const limiter = createRateLimiter(options.rateLimitWindowMs, options.rateLimitMax);

  app.addHook("onRequest", async (request, reply) => {
    for (const [key, value] of Object.entries(securityHeaders())) {
      reply.header(key, value);
    }

    const rateLimit = limiter(checkKey(request));
    reply.header("x-ratelimit-limit", String(options.rateLimitMax));
    reply.header("x-ratelimit-remaining", String(Math.max(0, rateLimit.remaining)));
    if (!rateLimit.allowed) {
      return sendSecurityError(reply, 429, "RATE_LIMITED", "Too many requests.");
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (shouldBypassOperatorAuth(request.method, request.url)) return;
    if (isOperatorAuthorized(request.headers, options.operatorToken)) return;

    return sendSecurityError(reply, 401, "OPERATOR_AUTH_REQUIRED", "Operator authentication required.");
  });
}

function createRateLimiter(windowMs: number, maxRequests: number) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (key: string) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1 };
    }

    current.count += 1;
    return {
      allowed: current.count <= maxRequests,
      remaining: maxRequests - current.count
    };
  };
}

function checkKey(request: FastifyRequest) {
  const forwardedFor = headerValue(request.headers["x-forwarded-for"]);
  const ip = forwardedFor?.split(",")[0]?.trim() || request.ip || "unknown";
  return `${ip}:${request.method}:${request.url.split("?")[0]}`;
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function sendSecurityError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).send({
    error: {
      code,
      message,
      details: {}
    }
  });
}
