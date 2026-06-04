import { describe, expect, it } from "vitest";
import {
  evaluatePatchPolicies,
  isPathInScope,
  pathMatchesGlob
} from "../src/services/patchService.js";
import type { MissionRow } from "../src/services/missionService.js";

const mission = {
  id: "mission_1",
  projectId: "project_1",
  status: "APPROVED",
  riskLevel: "medium",
  autonomyLevel: 4,
  scope: { include: ["apps/**", "packages/**"], exclude: [".env*", "secrets/**"] }
} as MissionRow;

describe("patch service", () => {
  it("matches common mission scope globs", () => {
    expect(pathMatchesGlob("apps/api/src/index.ts", "apps/**")).toBe(true);
    expect(pathMatchesGlob("packages/shared/src/index.ts", "apps/**")).toBe(false);
  });

  it("allows only files inside mission scope", () => {
    expect(isPathInScope("apps/api/src/index.ts", mission.scope)).toBe(true);
    expect(isPathInScope("crates/agentops-core/src/lib.rs", mission.scope)).toBe(false);
    expect(isPathInScope(".env.local", mission.scope)).toBe(false);
  });

  it("denies patch proposals outside mission scope", () => {
    const result = evaluatePatchPolicies(
      mission,
      [{ path: "crates/agentops-core/src/lib.rs" }],
      "coder"
    );

    expect(result.decision).toBe("deny");
    expect(result.findings[0].matched_rule).toBe("deny_patch_outside_scope");
  });

  it("requires approval for database scoped changes", () => {
    const result = evaluatePatchPolicies(
      { ...mission, scope: { include: ["apps/**"], exclude: [] } },
      [{ path: "apps/api/migrations/0002.sql" }],
      "coder"
    );

    expect(result.decision).toBe("require_approval");
  });
});
