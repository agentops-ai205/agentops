import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../src/services/policy.js";

describe("policy engine", () => {
  it("blocks raw secret paths", () => {
    const result = evaluatePolicy({
      type: "file_read",
      path: ".env",
      autonomy_level: 2,
      risk_level: "medium"
    });
    expect(result.decision).toBe("deny");
    expect(result.engine).toBe("rust_core");
  });

  it("requires approval for auth changes", () => {
    expect(
      evaluatePolicy({
        type: "file_write",
        path: "auth/session.ts",
        autonomy_level: 4,
        risk_level: "high"
      }).decision
    ).toBe("require_approval");
  });

  it("allows workflow commands in v1 sandbox", () => {
    expect(
      evaluatePolicy({
        type: "command_execute",
        command: "npm run test",
        autonomy_level: 4,
        risk_level: "medium"
      }).decision
    ).toBe("allow");
  });

  it("requires review for critical risk from the Rust core contract", () => {
    const result = evaluatePolicy({
      type: "file_write",
      path: "apps/web/src/App.tsx",
      autonomy_level: 3,
      risk_level: "critical"
    });

    expect(result).toMatchObject({
      decision: "require_review",
      matched_rule: "require_review_for_critical_risk",
      engine: "rust_core"
    });
  });
});
