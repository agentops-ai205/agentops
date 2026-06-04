import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { evidence, missions } from "../db/schema.js";
import { config } from "../config.js";
import { hashEvidencePayload, type EvidenceHashInput } from "./evidenceHash.js";
import { id } from "./ids.js";

export interface CreateEvidenceRecordInput extends EvidenceHashInput {
  organizationId?: string;
}

export async function createEvidenceRecord(input: CreateEvidenceRecordInput) {
  const organizationId = input.organizationId ?? (await getMissionOrganizationId(input.missionId));
  const proof = {
    id: id("evd"),
    organizationId,
    missionId: input.missionId,
    type: input.type,
    title: input.title,
    content: input.content,
    metadata: input.metadata ?? {},
    createdBy: input.createdBy,
    hash: hashEvidencePayload(input),
    createdAt: new Date()
  };

  await db.insert(evidence).values(proof);
  return proof;
}

async function getMissionOrganizationId(missionId: string) {
  const [mission] = await db
    .select({ organizationId: missions.organizationId })
    .from(missions)
    .where(eq(missions.id, missionId))
    .limit(1);
  return mission?.organizationId ?? config.defaultOrganizationId;
}
