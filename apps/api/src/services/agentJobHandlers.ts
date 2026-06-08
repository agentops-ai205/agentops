import type { AgentRole } from "@agentops/shared";
import { createEvidenceRecord } from "./evidenceService.js";
import { getMissionOrThrow } from "./missionService.js";
import { runAgentWithModelProvider } from "./agentRunner.js";
import { writeAuditEvent } from "./audit.js";

export async function runAgentJob(missionId: string, input: Record<string, unknown>) {
  const mission = await getMissionOrThrow(missionId);
  const role = String(input.role ?? "planner") as AgentRole;
  const requestedBy = String(input.requested_by ?? "human.operator");
  const providerId = typeof input.provider_id === "string" ? input.provider_id : undefined;
  const maxTokens = typeof input.max_tokens === "number" ? input.max_tokens : undefined;
  const context = input.context && typeof input.context === "object" ? input.context as Record<string, unknown> : {};
  const result = await runAgentWithModelProvider(mission, role, {
    providerId,
    maxTokens,
    context
  });
  const proof = await createEvidenceRecord({
    missionId: mission.id,
    type: result.evidence.type,
    title: result.evidence.title,
    content: result.evidence.content,
    metadata: {
      ...result.evidence.metadata,
      findings: result.findings,
      recommended_commands: result.recommendedCommands,
      residual_risk: result.residualRisk
    },
    createdBy: `agent.${role}`
  });

  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: requestedBy,
    agentId: `agent.${role}`,
    eventType: "agent_run_completed",
    autonomyLevel: mission.autonomyLevel,
    reason: result.summary,
    result: result.status,
    metadata: {
      role,
      evidence_id: proof.id,
      proposed_status: result.proposedStatus,
      recommended_commands: result.recommendedCommands,
      model_provider_id: result.model?.providerId,
      model: result.model?.model,
      model_usage: result.model?.usage
    }
  });

  return { agent_result: result, evidence: proof };
}
