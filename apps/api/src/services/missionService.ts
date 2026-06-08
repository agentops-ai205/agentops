import type { ApprovalInput, MissionStatus } from "@agentops/shared";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { approvals, evaluations, evidence, missions } from "../db/schema.js";
import { badRequest, conflict, forbidden, notFound } from "../http/errors.js";
import { id } from "./ids.js";
import {
  isEvaluationAcceptable,
  statusAfterEvaluation,
  statusAfterPlanning
} from "./missionRules.js";
import { assertTransition } from "./stateMachine.js";

export type MissionRow = typeof missions.$inferSelect;
type MissionInsert = typeof missions.$inferInsert;

const approverRoles = new Set([
  "project_owner",
  "technical_owner",
  "security_owner",
  "data_owner",
  "release_owner",
  "governance_owner"
]);

export async function getMissionOrThrow(missionId: string) {
  const [mission] = await db.select().from(missions).where(eq(missions.id, missionId));
  if (!mission) {
    throw notFound("MISSION_NOT_FOUND", "Mission not found", { mission_id: missionId });
  }
  return mission;
}

export async function transitionMission(
  mission: MissionRow,
  to: MissionStatus,
  updates: Partial<MissionInsert> = {}
) {
  assertTransition(mission.status as MissionStatus, to);
  const [updated] = await db
    .update(missions)
    .set({ ...updates, status: to, updatedAt: new Date() })
    .where(eq(missions.id, mission.id))
    .returning();
  if (!updated) {
    throw notFound("MISSION_NOT_FOUND", "Mission not found", { mission_id: mission.id });
  }
  return updated;
}

export function createDefaultPlan(mission: MissionRow) {
  return {
    strategy: "Governed AgentOps execution plan",
    impact: mission.scope,
    gates: ["policy_checked", "evidence_attached", "human_review"],
    steps: [
      "Validate scope and exclusions",
      "Evaluate policy for target action",
      "Execute only approved or allowlisted actions",
      "Attach evidence and hash",
      "Run mission evaluation before close"
    ],
    generated_at: new Date().toISOString()
  };
}

export async function planMission(mission: MissionRow) {
  const plan = createDefaultPlan(mission);
  let updated = await transitionMission(mission, "PLANNED", { plan });
  const targetStatus = statusAfterPlanning(mission.autonomyLevel);
  updated = await transitionMission(updated, targetStatus);
  return { mission: updated, plan };
}

export async function recordMissionApproval(mission: MissionRow, body: ApprovalInput) {
  if (body.scope.length === 0) {
    throw badRequest("APPROVAL_SCOPE_REQUIRED", "Approval scope is required.");
  }
  if (!approverRoles.has(body.role)) {
    throw forbidden("APPROVER_ROLE_NOT_ALLOWED", "Approver role is not allowed for mission approval.", {
      role: body.role
    });
  }

  const approval = {
    id: id("appr"),
    organizationId: mission.organizationId,
    missionId: mission.id,
    approver: body.approver,
    role: body.role,
    decision: body.decision,
    scope: body.scope,
    reason: body.reason,
    expiresAt: null,
    createdAt: new Date()
  };
  await db.insert(approvals).values(approval);
  const shouldTransitionMission = mission.status === "WAITING_APPROVAL";
  const targetStatus = body.decision === "approved" ? "APPROVED" : "BLOCKED";
  const updatedMission = shouldTransitionMission
    ? await transitionMission(mission, targetStatus)
    : mission;

  return { approval, mission: updatedMission };
}

export async function advanceAfterEvaluation(mission: MissionRow, decision: string) {
  const nextStatus = statusAfterEvaluation(mission.status as MissionStatus, decision);
  if (!nextStatus) return mission;
  return transitionMission(mission, nextStatus);
}

export async function closeMission(mission: MissionRow) {
  const missionEvidence = await db.select().from(evidence).where(eq(evidence.missionId, mission.id));
  if (missionEvidence.length === 0) {
    throw conflict("MISSION_EVIDENCE_REQUIRED", "Mission cannot close without evidence.", {
      mission_id: mission.id
    });
  }

  const [latestEvaluation] = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.missionId, mission.id))
    .orderBy(desc(evaluations.createdAt))
    .limit(1);

  if (!latestEvaluation) {
    throw conflict("MISSION_EVALUATION_REQUIRED", "Mission cannot close without evaluation.", {
      mission_id: mission.id
    });
  }

  if (!isEvaluationAcceptable(latestEvaluation.decision)) {
    throw conflict("MISSION_EVALUATION_NOT_ACCEPTABLE", "Mission evaluation is not acceptable for close.", {
      mission_id: mission.id,
      decision: latestEvaluation.decision
    });
  }

  return transitionMission(mission, "CLOSED", { closedAt: new Date() });
}
