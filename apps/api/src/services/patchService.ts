import type {
  AgentRole,
  PatchProposalStatus,
  PolicyDecision,
  ProposePatchInput
} from "@agentops/shared";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { approvals, patchProposals } from "../db/schema.js";
import { conflict, forbidden, notFound } from "../http/errors.js";
import { createEvidenceRecord } from "./evidenceService.js";
import { id } from "./ids.js";
import type { MissionRow } from "./missionService.js";
import { evaluatePolicy } from "./policy.js";
import { assertToolRole } from "./toolRegistry.js";

interface Scope {
  include: string[];
  exclude: string[];
}

export interface PatchPolicyFinding {
  path: string;
  decision: PolicyDecision;
  reason: string;
  matched_rule: string;
}

const decisionRank: Record<PolicyDecision, number> = {
  allow: 0,
  require_more_context: 1,
  require_sandbox: 2,
  require_review: 3,
  require_approval: 4,
  deny: 5
};

export function normalizePath(input: string) {
  return input.replace(/^\.\//, "").replace(/\/+/g, "/");
}

export function pathMatchesGlob(path: string, pattern: string) {
  const normalizedPattern = normalizePath(pattern);
  const source = normalizedPattern
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((chunk) => chunk.replace(/[.+^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*");
  return new RegExp(`^${source}$`).test(normalizePath(path));
}

export function isPathInScope(path: string, scope: unknown) {
  const missionScope = parseScope(scope);
  const normalized = normalizePath(path);
  const include = missionScope.include.length > 0 ? missionScope.include : ["**"];
  const included = include.some((pattern) => pathMatchesGlob(normalized, pattern));
  const excluded = missionScope.exclude.some((pattern) => pathMatchesGlob(normalized, pattern));
  return included && !excluded;
}

export function evaluatePatchPolicies(
  mission: MissionRow,
  files: { path: string }[],
  agentRole: AgentRole
) {
  const findings: PatchPolicyFinding[] = files.map((file) => {
    if (!isPathInScope(file.path, mission.scope)) {
      return {
        path: normalizePath(file.path),
        decision: "deny",
        reason: "Patch file is outside declared mission scope.",
        matched_rule: "deny_patch_outside_scope"
      };
    }

    const policy = evaluatePolicy({
      type: "file_write",
      path: normalizePath(file.path),
      agent_role: agentRole,
      autonomy_level: mission.autonomyLevel,
      risk_level: mission.riskLevel as never
    });
    return {
      path: normalizePath(file.path),
      decision: policy.decision,
      reason: policy.reason,
      matched_rule: policy.matched_rule
    };
  });

  return {
    decision: strongestDecision(findings.map((finding) => finding.decision)),
    findings
  };
}

export async function proposePatch(mission: MissionRow, input: ProposePatchInput) {
  assertToolRole("propose_patch", input.agent_role);
  const policy = evaluatePatchPolicies(mission, input.files, input.agent_role);
  if (policy.decision === "deny") {
    throw forbidden("PATCH_POLICY_DENIED", "Patch proposal denied by policy.", {
      findings: policy.findings
    });
  }

  const patchId = id("patch");
  const status: PatchProposalStatus =
    policy.decision === "allow" ? "proposed" : "waiting_approval";

  const [proposal] = await db
    .insert(patchProposals)
    .values({
      id: patchId,
      organizationId: mission.organizationId,
      missionId: mission.id,
      title: input.title,
      summary: input.summary,
      files: input.files.map((file) => ({
        path: normalizePath(file.path),
        change_type: file.change_type
      })),
      unifiedDiff: input.unified_diff,
      riskLevel: input.risk_level,
      generatedBy: input.generated_by,
      agentRole: input.agent_role,
      status,
      policyDecision: policy.decision,
      policyFindings: policy.findings,
      evidenceId: null,
      createdAt: new Date(),
      appliedAt: null
    })
    .returning();

  const proof = await createEvidenceRecord({
    missionId: mission.id,
    type: "patch",
    title: `${input.title} patch evidence`,
    content: input.unified_diff,
    metadata: {
      patch_id: patchId,
      files: input.files,
      policy_decision: policy.decision,
      policy_findings: policy.findings
    },
    createdBy: input.generated_by
  });

  const [updated] = await db
    .update(patchProposals)
    .set({ evidenceId: proof.id })
    .where(eq(patchProposals.id, patchId))
    .returning();

  return { proposal: updated ?? proposal, evidence: proof, policy };
}

export async function getPatchProposalOrThrow(patchId: string) {
  const [proposal] = await db
    .select()
    .from(patchProposals)
    .where(eq(patchProposals.id, patchId));
  if (!proposal) {
    throw notFound("PATCH_NOT_FOUND", "Patch proposal not found.", { patch_id: patchId });
  }
  return proposal;
}

export async function markPatchReadyToApply(patchId: string, agentRole: AgentRole) {
  assertToolRole("apply_patch", agentRole);
  const proposal = await getPatchProposalOrThrow(patchId);
  if (proposal.policyDecision === "deny") {
    throw forbidden("PATCH_POLICY_DENIED", "Denied patch cannot be applied.", { patch_id: patchId });
  }
  if (!["proposed", "waiting_approval"].includes(proposal.status)) {
    throw conflict("PATCH_STATUS_INVALID", "Patch proposal is not applyable in its current status.", {
      patch_id: patchId,
      status: proposal.status
    });
  }
  const approved = await hasPatchApproval(proposal.missionId, patchId);
  if (!approved) {
    throw conflict("PATCH_APPROVAL_REQUIRED", "Patch application requires human approval.", {
      patch_id: patchId,
      required_scope: [`patch:${patchId}`, "patch_apply"]
    });
  }

  const [updated] = await db
    .update(patchProposals)
    .set({ status: "ready_to_apply", appliedAt: new Date() })
    .where(eq(patchProposals.id, patchId))
    .returning();
  return updated ?? proposal;
}

async function hasPatchApproval(missionId: string, patchId: string) {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.missionId, missionId))
    .orderBy(desc(approvals.createdAt));

  return rows.some((approval) => {
    if (approval.decision !== "approved") return false;
    const scope = Array.isArray(approval.scope) ? approval.scope.map(String) : [];
    return scope.includes(`patch:${patchId}`) || scope.includes("patch_apply");
  });
}

function strongestDecision(decisions: PolicyDecision[]) {
  return decisions.reduce<PolicyDecision>((strongest, decision) => {
    return decisionRank[decision] > decisionRank[strongest] ? decision : strongest;
  }, "allow");
}

function parseScope(scope: unknown): Scope {
  if (!scope || typeof scope !== "object") return { include: [], exclude: [] };
  const record = scope as Record<string, unknown>;
  return {
    include: Array.isArray(record.include) ? record.include.map(String) : [],
    exclude: Array.isArray(record.exclude) ? record.exclude.map(String) : []
  };
}
