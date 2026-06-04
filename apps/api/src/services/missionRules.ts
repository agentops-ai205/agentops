import type { MissionStatus, PolicyDecision } from "@agentops/shared";

export const acceptableEvaluationDecisions = new Set([
  "approve_with_notes",
  "approved",
  "approved_with_notes"
]);

export function statusAfterPlanning(autonomyLevel: number): MissionStatus {
  return autonomyLevel >= 3 ? "WAITING_APPROVAL" : "APPROVED";
}

export function blocksExecution(decision: PolicyDecision) {
  return decision !== "allow";
}

export function isEvaluationAcceptable(decision: string) {
  return acceptableEvaluationDecisions.has(decision);
}

export function statusAfterEvaluation(
  currentStatus: MissionStatus,
  evaluationDecision: string
): MissionStatus | null {
  if (evaluationDecision === "approve_with_notes" && currentStatus === "TESTING") {
    return "HUMAN_REVIEW";
  }
  return null;
}
