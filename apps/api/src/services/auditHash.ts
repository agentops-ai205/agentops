import { hashJsonWithRust } from "./rustHash.js";

export interface AuditHashPayload {
  id: string;
  organizationId: string | null;
  projectId: string | null;
  missionId: string | null;
  actorId: string;
  agentId: string | null;
  eventType: string;
  autonomyLevel: number;
  scope: Record<string, unknown>;
  reason: string;
  policyDecision: string;
  humanApprovalId: string | null;
  result: string;
  metadata: Record<string, unknown>;
  previousHash: string | null;
  createdAt: string;
}

export function hashAuditPayload(payload: AuditHashPayload) {
  return hashJsonWithRust(payload).hash;
}

export function hashAuditPayloadWithEngine(payload: AuditHashPayload) {
  return hashJsonWithRust(payload);
}

export function verifyAuditHash(payload: AuditHashPayload, expectedHash: string) {
  return hashAuditPayload(payload) === expectedHash;
}
