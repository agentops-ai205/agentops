import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import {
  configureHttpSecurity,
  isOperatorAuthorized,
  isOriginAllowed,
  securityHeaders,
  shouldBypassOperatorAuth
} from "../src/http/security.js";

describe("http security", () => {
  it("allows only configured origins in production", () => {
    const allowed = ["https://agentops.example.com"];

    expect(isOriginAllowed("https://agentops.example.com", allowed, "production")).toBe(true);
    expect(isOriginAllowed("https://evil.example.com", allowed, "production")).toBe(false);
  });

  it("allows local origins by default outside production", () => {
    expect(isOriginAllowed("http://127.0.0.1:5173", [], "development")).toBe(true);
  });

  it("requires operator token when configured", () => {
    expect(isOperatorAuthorized({}, "secret")).toBe(false);
    expect(isOperatorAuthorized({ authorization: "Bearer secret" }, "secret")).toBe(true);
    expect(isOperatorAuthorized({ "x-agentops-operator-token": "secret" }, "secret")).toBe(true);
  });

  it("bypasses operator auth for health and public auth entrypoints", () => {
    expect(shouldBypassOperatorAuth("GET", "/live")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/ready")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/health")).toBe(true);
    expect(shouldBypassOperatorAuth("POST", "/v1/auth/signup")).toBe(true);
    expect(shouldBypassOperatorAuth("POST", "/v1/auth/login")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/v1/overview")).toBe(false);
  });

  it("sets baseline hardening headers", () => {
    expect(securityHeaders()).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    });
  });

  it("accepts verified user sessions for protected app routes", async () => {
    const app = Fastify();
    configureHttpSecurity(app, {
      appEnv: "production",
      allowedOrigins: ["https://agentops.example.com"],
      operatorToken: "operator-secret",
      rateLimitWindowMs: 60_000,
      rateLimitMax: 10,
      userTokenVerifier: async (token) => token === "valid-session"
    });
    app.get("/v1/overview", async () => ({ ok: true }));

    const missing = await app.inject({ method: "GET", url: "/v1/overview" });
    expect(missing.statusCode).toBe(401);

    const valid = await app.inject({
      method: "GET",
      url: "/v1/overview",
      headers: { authorization: "Bearer valid-session" }
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json()).toEqual({ ok: true });
  });
});
