import type { MissionStatus } from "@agentops/shared";

export class InvalidMissionTransitionError extends Error {
  readonly statusCode = 409;
  readonly code = "MISSION_INVALID_TRANSITION";

  constructor(
    readonly from: MissionStatus,
    readonly to: MissionStatus
  ) {
    super(`Invalid mission transition: ${from} -> ${to}`);
    this.name = "InvalidMissionTransitionError";
  }
}

const linearTransitions: Record<MissionStatus, MissionStatus[]> = {
  DRAFT: ["PLANNED", "WAITING_APPROVAL", "CANCELLED", "BLOCKED"],
  PLANNED: ["WAITING_APPROVAL", "APPROVED", "CANCELLED", "BLOCKED"],
  WAITING_APPROVAL: ["APPROVED", "CANCELLED", "BLOCKED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED", "BLOCKED"],
  IN_PROGRESS: ["TESTING", "ROLLED_BACK", "BLOCKED", "CANCELLED"],
  TESTING: ["SECURITY_REVIEW", "HUMAN_REVIEW", "FAILED_TESTS", "BLOCKED"],
  SECURITY_REVIEW: ["HUMAN_REVIEW", "RISK_REJECTED", "BLOCKED"],
  HUMAN_REVIEW: ["READY_TO_MERGE", "REVISION_REQUIRED", "CLOSED", "BLOCKED"],
  READY_TO_MERGE: ["MERGED", "BLOCKED"],
  MERGED: ["LEARNING_CAPTURED"],
  LEARNING_CAPTURED: ["CLOSED"],
  CLOSED: [],
  BLOCKED: ["PLANNED", "CANCELLED"],
  CANCELLED: [],
  ROLLED_BACK: ["REVISION_REQUIRED", "CANCELLED"],
  REVISION_REQUIRED: ["IN_PROGRESS", "CANCELLED"],
  FAILED_TESTS: ["IN_PROGRESS", "CANCELLED"],
  RISK_REJECTED: ["REVISION_REQUIRED", "CANCELLED"]
};

export function canTransition(from: MissionStatus, to: MissionStatus) {
  return linearTransitions[from]?.includes(to) ?? false;
}

export function assertTransition(from: MissionStatus, to: MissionStatus) {
  if (!canTransition(from, to)) {
    throw new InvalidMissionTransitionError(from, to);
  }
}
