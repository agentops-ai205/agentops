import { describe, expect, it } from "vitest";
import { config } from "../src/config.js";
import {
  getSandboxWorkspace,
  safePathSegment
} from "../src/services/sandboxWorkspace.js";
import { hashAuditPayload } from "../src/services/auditHash.js";

describe("sandbox workspace", () => {
  it("sanitizes path segments", () => {
    expect(safePathSegment("AOS/MIS:001?secret")).toBe("AOS_MIS_001_secret");
    expect(safePathSegment("")).toBe("unknown");
  });

  it("builds mission workspace paths under configured sandbox root", () => {
    const workspace = getSandboxWorkspace("AOS/MIS:001");

    expect(workspace.root.startsWith(config.sandboxRoot)).toBe(true);
    expect(workspace.root).toContain("AOS_MIS_001");
    expect(workspace.artifactsDir).toContain("artifacts");
    expect(workspace.manifestsDir).toContain("manifests");
  });

  it("keeps audit hashing independent from sandbox paths", () => {
    const payload = {
      id: "evt_1",
      projectId: "project_1",
      missionId: "mission_1",
      actorId: "agent.tester",
      agentId: "agent.tester",
      eventType: "command_executed",
      autonomyLevel: 4,
      scope: {},
      reason: "Executed npm run test",
      policyDecision: "allow",
      humanApprovalId: null,
      result: "success",
      metadata: { sandbox: { isolation: "process_no_shell_workspace_artifacts" } },
      previousHash: null,
      createdAt: "2026-06-04T12:00:00.000Z"
    };

    expect(hashAuditPayload(payload)).toMatch(/^sha256:/);
  });
});
