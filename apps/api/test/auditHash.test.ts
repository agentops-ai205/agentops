import { describe, expect, it } from "vitest";
import {
  hashAuditPayload,
  hashAuditPayloadWithEngine,
  verifyAuditHash
} from "../src/services/auditHash.js";
import { stableJson } from "../src/services/canonicalJson.js";

const basePayload = {
  id: "evt_1",
  organizationId: "org.default",
  projectId: "project_1",
  missionId: "mission_1",
  actorId: "agent.tester",
  agentId: "agent.tester",
  eventType: "command_executed",
  autonomyLevel: 4,
  scope: { include: ["apps/**"], exclude: [".env*"] },
  reason: "Executed npm run test",
  policyDecision: "allow",
  humanApprovalId: null,
  result: "success",
  metadata: { b: 2, a: 1 },
  previousHash: "sha256:previous",
  createdAt: "2026-06-04T12:00:00.000Z"
};

describe("audit hash", () => {
  it("serializes objects with stable key order", () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
  });

  it("is stable for semantically identical payloads", () => {
    const samePayload = { ...basePayload, metadata: { a: 1, b: 2 } };

    expect(hashAuditPayload(basePayload)).toBe(hashAuditPayload(samePayload));
  });

  it("detects tampering", () => {
    const hash = hashAuditPayload(basePayload);
    const tampered = { ...basePayload, result: "failed" };

    expect(verifyAuditHash(basePayload, hash)).toBe(true);
    expect(verifyAuditHash(tampered, hash)).toBe(false);
  });

  it("binds audit events to an organization", () => {
    expect(hashAuditPayload(basePayload)).not.toBe(
      hashAuditPayload({ ...basePayload, organizationId: "org.other" })
    );
  });

  it("uses the Rust hash core when available", () => {
    const result = hashAuditPayloadWithEngine(basePayload);

    expect(result.hash.startsWith("sha256:")).toBe(true);
    expect(result.engine).toBe("rust_core");
  });
});
