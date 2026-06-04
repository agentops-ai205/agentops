import { describe, expect, it } from "vitest";
import {
  blocksExecution,
  isEvaluationAcceptable,
  statusAfterEvaluation,
  statusAfterPlanning
} from "../src/services/missionRules.js";

describe("mission rules", () => {
  it("sends higher autonomy plans to approval", () => {
    expect(statusAfterPlanning(2)).toBe("APPROVED");
    expect(statusAfterPlanning(3)).toBe("WAITING_APPROVAL");
  });

  it("blocks every non-allow policy until dedicated gates exist", () => {
    expect(blocksExecution("allow")).toBe(false);
    expect(blocksExecution("require_sandbox")).toBe(true);
    expect(blocksExecution("require_review")).toBe(true);
    expect(blocksExecution("require_approval")).toBe(true);
    expect(blocksExecution("deny")).toBe(true);
  });

  it("accepts only positive evaluation decisions for close", () => {
    expect(isEvaluationAcceptable("approve_with_notes")).toBe(true);
    expect(isEvaluationAcceptable("needs_more_evidence")).toBe(false);
    expect(isEvaluationAcceptable("reject_until_risk_reduced")).toBe(false);
  });

  it("moves successful testing evaluations to human review", () => {
    expect(statusAfterEvaluation("TESTING", "approve_with_notes")).toBe("HUMAN_REVIEW");
    expect(statusAfterEvaluation("TESTING", "needs_more_evidence")).toBeNull();
    expect(statusAfterEvaluation("APPROVED", "approve_with_notes")).toBeNull();
  });
});
