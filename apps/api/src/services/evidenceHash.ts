import type { EvidenceType } from "@agentops/shared";
import { hashJsonWithRust } from "./rustHash.js";

export interface EvidenceHashInput {
  missionId: string;
  type: EvidenceType;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdBy: string;
}

export function hashEvidencePayload(input: EvidenceHashInput) {
  return hashJsonWithRust(toEvidenceHashPayload(input)).hash;
}

export function hashEvidencePayloadWithEngine(input: EvidenceHashInput) {
  return hashJsonWithRust(toEvidenceHashPayload(input));
}

function toEvidenceHashPayload(input: EvidenceHashInput) {
  return {
    mission_id: input.missionId,
    type: input.type,
    title: input.title,
    content: input.content,
    metadata: input.metadata ?? {},
    created_by: input.createdBy
  };
}
