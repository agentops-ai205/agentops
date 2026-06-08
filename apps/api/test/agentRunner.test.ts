import { describe, expect, it } from "vitest";
import { runDeterministicAgent } from "../src/services/agentRunner.js";
import type { MissionRow } from "../src/services/missionService.js";

const mission = {
  id: "mission_1",
  projectId: "project_1",
  title: "Harden control plane",
  intent: "Make agents governed",
  status: "APPROVED",
  riskLevel: "medium",
  autonomyLevel: 4,
  scope: { include: ["apps/**"], exclude: [".env*"] }
} as MissionRow;

describe("deterministic agent runner", () => {
  it("planner proposes a governed plan", () => {
    const result = runDeterministicAgent(mission, "planner");

    expect(result.status).toBe("completed");
    expect(result.proposedStatus).toBe("WAITING_APPROVAL");
    expect(result.evidence.type).toBe("plan");
  });

  it("tester recommends baseline commands", () => {
    const result = runDeterministicAgent(mission, "tester");

    expect(result.recommendedCommands).toContain("npm run test");
    expect(result.recommendedCommands).toContain("npm run build");
    expect(result.evidence.type).toBe("report");
  });

  it("reviewer blocks early missions until evidence exists", () => {
    const result = runDeterministicAgent(mission, "reviewer");

    expect(result.status).toBe("needs_approval");
    expect(result.findings.join(" ")).toContain("evidence");
  });

  it("blocks roles without deterministic implementation", () => {
    const result = runDeterministicAgent(mission, "security");

    expect(result.status).toBe("blocked");
    expect(result.evidence.metadata.reason).toBe("runner_not_implemented");
  });
});
