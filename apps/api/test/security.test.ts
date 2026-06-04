import { describe, expect, it } from "vitest";
import {
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

  it("bypasses operator auth only for liveness and readiness", () => {
    expect(shouldBypassOperatorAuth("GET", "/live")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/ready")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/health")).toBe(true);
    expect(shouldBypassOperatorAuth("GET", "/v1/overview")).toBe(false);
  });

  it("sets baseline hardening headers", () => {
    expect(securityHeaders()).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    });
  });
});
