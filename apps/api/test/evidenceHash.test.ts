import { describe, expect, it } from "vitest";
import {
  hashEvidencePayload,
  hashEvidencePayloadWithEngine
} from "../src/services/evidenceHash.js";

const baseEvidence = {
  missionId: "mission_1",
  type: "test_result" as const,
  title: "npm run test evidence",
  content: "Command output",
  metadata: { exitCode: 0, command: "npm run test" },
  createdBy: "agent.tester"
};

describe("evidence hash", () => {
  it("is stable for metadata key order", () => {
    const sameEvidence = {
      ...baseEvidence,
      metadata: { command: "npm run test", exitCode: 0 }
    };

    expect(hashEvidencePayload(baseEvidence)).toBe(hashEvidencePayload(sameEvidence));
  });

  it("changes when evidence content changes", () => {
    expect(hashEvidencePayload(baseEvidence)).not.toBe(
      hashEvidencePayload({ ...baseEvidence, content: "Different output" })
    );
  });

  it("binds evidence to its creator", () => {
    expect(hashEvidencePayload(baseEvidence)).not.toBe(
      hashEvidencePayload({ ...baseEvidence, createdBy: "human.operator" })
    );
  });

  it("uses the Rust hash core when available", () => {
    const result = hashEvidencePayloadWithEngine(baseEvidence);

    expect(result.hash.startsWith("sha256:")).toBe(true);
    expect(result.engine).toBe("rust_core");
  });
});
