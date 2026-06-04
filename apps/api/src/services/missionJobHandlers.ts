import { evaluations } from "../db/schema.js";
import { db } from "../db/client.js";
import { evaluateMission } from "./evaluation.js";
import { createEvidenceRecord } from "./evidenceService.js";
import { runSandboxCommand } from "./executor.js";
import { id } from "./ids.js";
import {
  advanceAfterEvaluation,
  getMissionOrThrow,
  transitionMission
} from "./missionService.js";
import { blocksExecution } from "./missionRules.js";
import { evaluatePolicy } from "./policy.js";
import { writeAuditEvent } from "./audit.js";

export async function runMissionCommandJob(missionId: string, input: Record<string, unknown>) {
  const mission = await getMissionOrThrow(missionId);
  const command = String(input.command ?? "npm run test").trim();
  const agentId = String(input.agent_id ?? "agent.tester");
  const policy = evaluatePolicy({
    type: "command_execute",
    command,
    agent_role: "tester",
    autonomy_level: mission.autonomyLevel,
    risk_level: mission.riskLevel as never
  });

  if (blocksExecution(policy.decision)) {
    await writeAuditEvent({
      projectId: mission.projectId,
      missionId: mission.id,
      actorId: agentId,
      agentId,
      eventType: "execution_blocked",
      autonomyLevel: mission.autonomyLevel,
      policyDecision: policy.decision,
      reason: policy.reason,
      result: "blocked"
    });
    throw new Error(policy.reason);
  }

  let updatedMission = await transitionMission(mission, "IN_PROGRESS");
  const result = await runSandboxCommand(command, { missionId: mission.id });
  const content = [
    `Command: ${result.command}`,
    `Exit code: ${result.exitCode}`,
    `Signal: ${result.signal ?? "none"}`,
    `Timed out: ${result.timedOut}`,
    `Sandbox: shell=${result.sandbox.shell}, env=${result.sandbox.env}, network=${result.sandbox.network}, isolation=${result.sandbox.isolation}`,
    `Workspace: ${result.sandbox.workspaceRoot ?? "not-created"}`,
    `Manifest: ${result.sandbox.manifestPath ?? "not-created"}`,
    "",
    result.output
  ].join("\n");
  const evidenceType =
    result.exitCode !== 0
      ? "command_output"
      : command.includes("build")
        ? "build_result"
        : command.includes("test")
          ? "test_result"
          : "command_output";
  const proof = await createEvidenceRecord({
    missionId: mission.id,
    type: evidenceType,
    title: `${command} evidence`,
    content,
    metadata: {
      command,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      sandbox: result.sandbox,
      policy
    },
    createdBy: agentId
  });

  updatedMission = await transitionMission(updatedMission, "TESTING");
  if (result.exitCode !== 0) {
    updatedMission = await transitionMission(updatedMission, "FAILED_TESTS");
  }

  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: agentId,
    agentId,
    eventType: "command_executed",
    autonomyLevel: mission.autonomyLevel,
    policyDecision: policy.decision,
    reason: `Executed ${command}`,
    result: result.exitCode === 0 ? "success" : "failed",
    metadata: {
      evidence_id: proof.id,
      hash: proof.hash,
      exitCode: result.exitCode,
      signal: result.signal,
      timedOut: result.timedOut,
      sandbox: result.sandbox,
      mission_status: updatedMission.status
    }
  });

  return { policy, command: result, evidence: proof, mission_status: updatedMission.status };
}

export async function runEvaluationJob(missionId: string) {
  const mission = await getMissionOrThrow(missionId);
  const result = await evaluateMission(mission.id);
  const evaluation = {
    id: id("eval"),
    organizationId: mission.organizationId,
    missionId: mission.id,
    scores: result.scores,
    decision: result.decision,
    findings: result.findings,
    requiredFollowups: result.required_followups,
    createdAt: new Date()
  };
  await db.insert(evaluations).values(evaluation);
  const updatedMission = await advanceAfterEvaluation(mission, result.decision);
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    agentId: "agent.reviewer",
    eventType: "mission_evaluated",
    autonomyLevel: mission.autonomyLevel,
    reason: result.decision,
    metadata: { scores: result.scores, mission_status: updatedMission.status }
  });
  return { evaluation, mission_status: updatedMission.status };
}
