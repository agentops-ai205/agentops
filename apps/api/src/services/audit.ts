import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { auditEvents } from "../db/schema.js";
import { config } from "../config.js";
import { hashAuditPayload } from "./auditHash.js";
import { id } from "./ids.js";

export interface AuditInput {
  organizationId?: string | null;
  projectId?: string | null;
  missionId?: string | null;
  actorId?: string | null;
  agentId?: string | null;
  eventType: string;
  autonomyLevel?: number;
  scope?: Record<string, unknown>;
  reason?: string;
  policyDecision?: string;
  humanApprovalId?: string | null;
  result?: string;
  metadata?: Record<string, unknown>;
}

export async function writeAuditEvent(input: AuditInput) {
  const createdAt = new Date();
  const previousHash = await getPreviousHash(input);
  const event = {
    id: id("evt"),
    organizationId: input.organizationId ?? config.defaultOrganizationId,
    projectId: input.projectId ?? null,
    missionId: input.missionId ?? null,
    actorId: input.actorId ?? input.agentId ?? "system",
    agentId: input.agentId ?? null,
    eventType: input.eventType,
    autonomyLevel: input.autonomyLevel ?? 0,
    scope: input.scope ?? {},
    reason: input.reason ?? "",
    policyDecision: input.policyDecision ?? "allow",
    humanApprovalId: input.humanApprovalId ?? null,
    result: input.result ?? "success",
    metadata: input.metadata ?? {},
    previousHash,
    eventHash: "",
    createdAt
  };
  event.eventHash = hashAuditPayload({
    id: event.id,
    organizationId: event.organizationId,
    projectId: event.projectId,
    missionId: event.missionId,
    actorId: event.actorId,
    agentId: event.agentId,
    eventType: event.eventType,
    autonomyLevel: event.autonomyLevel,
    scope: event.scope,
    reason: event.reason,
    policyDecision: event.policyDecision,
    humanApprovalId: event.humanApprovalId,
    result: event.result,
    metadata: event.metadata,
    previousHash: event.previousHash,
    createdAt: event.createdAt.toISOString()
  });

  await db.insert(auditEvents).values(event);

  const auditDir = path.join(config.projectRoot, ".agentops/audit");
  await mkdir(auditDir, { recursive: true });
  await appendFile(
    path.join(auditDir, "action-log.jsonl"),
    `${JSON.stringify({
      event_id: event.id,
      timestamp: event.createdAt.toISOString(),
      organization_id: event.organizationId,
      project_id: event.projectId,
      mission_id: event.missionId,
      actor_id: event.actorId,
      agent_id: event.agentId,
      event_type: event.eventType,
      autonomy_level: event.autonomyLevel,
      scope: event.scope,
      reason: event.reason,
      policy_decision: event.policyDecision,
      human_approval_id: event.humanApprovalId,
      result: event.result,
      metadata: event.metadata,
      previous_hash: event.previousHash,
      event_hash: event.eventHash
    })}\n`
  );

  return event;
}

async function getPreviousHash(input: AuditInput) {
  if (input.missionId) {
    const [latest] = await db
      .select({ eventHash: auditEvents.eventHash })
      .from(auditEvents)
      .where(eq(auditEvents.missionId, input.missionId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    return latest?.eventHash || null;
  }

  if (input.projectId) {
    const [latest] = await db
      .select({ eventHash: auditEvents.eventHash })
      .from(auditEvents)
      .where(eq(auditEvents.projectId, input.projectId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);
    return latest?.eventHash || null;
  }

  const [latest] = await db
    .select({ eventHash: auditEvents.eventHash })
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);
  return latest?.eventHash || null;
}
