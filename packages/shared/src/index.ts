import { z } from "zod";

export const missionStatuses = [
  "DRAFT",
  "PLANNED",
  "WAITING_APPROVAL",
  "APPROVED",
  "IN_PROGRESS",
  "TESTING",
  "SECURITY_REVIEW",
  "HUMAN_REVIEW",
  "READY_TO_MERGE",
  "MERGED",
  "LEARNING_CAPTURED",
  "CLOSED",
  "BLOCKED",
  "CANCELLED",
  "ROLLED_BACK",
  "REVISION_REQUIRED",
  "FAILED_TESTS",
  "RISK_REJECTED"
] as const;

export const riskLevels = ["low", "medium", "high", "critical"] as const;

export const policyDecisions = [
  "allow",
  "deny",
  "require_approval",
  "require_sandbox",
  "require_review",
  "require_more_context"
] as const;

export const agentRoles = [
  "planner",
  "architect",
  "coder",
  "tester",
  "security",
  "reviewer",
  "documenter",
  "metadev",
  "release"
] as const;

export const evidenceTypes = [
  "plan",
  "patch",
  "command_output",
  "test_result",
  "build_result",
  "execution",
  "test",
  "report",
  "review",
  "security_review",
  "approval",
  "deployment",
  "rollback",
  "memory_capture"
] as const;

export const patchChangeTypes = ["create", "modify", "delete"] as const;
export const patchProposalStatuses = [
  "proposed",
  "waiting_approval",
  "rejected",
  "ready_to_apply",
  "applied"
] as const;

export const jobTypes = [
  "tool.run_command",
  "evaluation.run",
  "patch.apply_guarded",
  "agent.run"
] as const;
export const jobStatuses = ["queued", "running", "succeeded", "failed", "cancelled", "dead"] as const;
export const modelProviderKinds = [
  "manual",
  "null",
  "fake",
  "local_http",
  "closed_api",
  "private_endpoint"
] as const;
export const modelFinishReasons = ["stop", "length", "tool_call", "error"] as const;

export type MissionStatus = (typeof missionStatuses)[number];
export type RiskLevel = (typeof riskLevels)[number];
export type PolicyDecision = (typeof policyDecisions)[number];
export type AgentRole = (typeof agentRoles)[number];
export type EvidenceType = (typeof evidenceTypes)[number];
export type PatchChangeType = (typeof patchChangeTypes)[number];
export type PatchProposalStatus = (typeof patchProposalStatuses)[number];
export type JobType = (typeof jobTypes)[number];
export type JobStatus = (typeof jobStatuses)[number];
export type ModelProviderKind = (typeof modelProviderKinds)[number];
export type ModelFinishReason = (typeof modelFinishReasons)[number];

export const scopeSchema = z.object({
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([])
});

export const createProjectSchema = z.object({
  id: z.string().min(3).optional(),
  organization_id: z.string().min(3).default("org.default"),
  name: z.string().min(2),
  type: z.string().default("web_application"),
  criticality: z.enum(riskLevels).default("medium"),
  owners: z.record(z.string()).default({}),
  repos: z.array(z.string()).default([])
});

export const createMissionSchema = z.object({
  title: z.string().min(3),
  intent: z.string().min(3),
  context: z.record(z.unknown()).default({}),
  scope: scopeSchema.default({ include: [], exclude: [] }),
  constraints: z.record(z.unknown()).default({}),
  success_criteria: z.array(z.string()).min(1),
  risk_level: z.enum(riskLevels).default("medium"),
  autonomy_level: z.number().int().min(0).max(9).default(2),
  human_approval: z
    .object({
      before_execution: z.boolean().default(true),
      before_merge: z.boolean().default(true),
      before_policy_change: z.boolean().default(true)
    })
    .default({
      before_execution: true,
      before_merge: true,
      before_policy_change: true
    })
});

export const policyActionSchema = z.object({
  type: z.string(),
  path: z.string().optional(),
  command: z.string().optional(),
  agent_role: z.enum(agentRoles).optional(),
  autonomy_level: z.number().int().min(0).max(9).default(2),
  risk_level: z.enum(riskLevels).default("medium")
});

export const approvalSchema = z.object({
  approver: z.string().min(2),
  role: z.string().min(2),
  decision: z.enum(["approved", "rejected"]),
  scope: z.array(z.string()).default([]),
  reason: z.string().default("")
});

export const evidenceSchema = z.object({
  mission_id: z.string(),
  type: z.enum(evidenceTypes),
  title: z.string(),
  content: z.string(),
  metadata: z.record(z.unknown()).default({}),
  created_by: z.string().min(2).default("human.operator")
});

export const patchFileSchema = z.object({
  path: z.string().min(1),
  change_type: z.enum(patchChangeTypes).default("modify")
});

export const proposePatchSchema = z.object({
  title: z.string().min(3),
  summary: z.string().min(3),
  files: z.array(patchFileSchema).min(1),
  unified_diff: z.string().min(1),
  risk_level: z.enum(riskLevels).default("medium"),
  generated_by: z.string().min(2).default("agent.coder"),
  agent_role: z.enum(agentRoles).default("coder")
});

export const applyPatchSchema = z.object({
  actor_id: z.string().min(2).default("human.operator"),
  role: z.string().min(2).default("technical_owner"),
  agent_role: z.enum(agentRoles).default("reviewer"),
  reason: z.string().default("Patch application requested after human approval.")
});

export const enqueueJobSchema = z.object({
  type: z.enum(jobTypes),
  project_id: z.string(),
  mission_id: z.string().optional(),
  input: z.record(z.unknown()).default({}),
  max_attempts: z.number().int().min(1).max(10).default(1),
  idempotency_key: z.string().optional()
});

export const agentRunSchema = z.object({
  role: z.enum(agentRoles),
  requested_by: z.string().min(2).default("human.operator"),
  provider_id: z.string().min(2).optional(),
  max_tokens: z.number().int().min(64).max(16_000).default(1200),
  context: z.record(z.unknown()).default({})
});

export const improvementProposalSchema = z.object({
  target: z.string(),
  change_type: z.string(),
  rationale: z.string(),
  proposed_change: z.string(),
  expected_gain: z.record(z.unknown()).default({}),
  risk: z.enum(riskLevels).default("low"),
  evaluation_plan: z.record(z.unknown()).default({}),
  rollback_plan: z.record(z.unknown()).default({}),
  approval_required_from: z.array(z.string()).default(["technical_owner"])
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateMissionInput = z.infer<typeof createMissionSchema>;
export type PolicyAction = z.infer<typeof policyActionSchema>;
export type ApprovalInput = z.infer<typeof approvalSchema>;
export type EvidenceInput = z.infer<typeof evidenceSchema>;
export type ProposePatchInput = z.infer<typeof proposePatchSchema>;
export type ApplyPatchInput = z.infer<typeof applyPatchSchema>;
export type EnqueueJobInput = z.infer<typeof enqueueJobSchema>;
export type AgentRunInput = z.infer<typeof agentRunSchema>;
export type ImprovementProposalInput = z.infer<typeof improvementProposalSchema>;
