import {
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp
} from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("single_tenant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const userAccounts = pgTable("user_accounts", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("owner"),
  language: text("language").notNull().default("en"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const userSessions = pgTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  organizationId: text("organization_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
});

export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  name: text("name").notNull(),
  type: text("type").notNull(),
  criticality: text("criticality").notNull(),
  owners: jsonb("owners").notNull(),
  repos: jsonb("repos").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull()
});

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  role: text("role").notNull(),
  name: text("name").notNull(),
  capabilities: jsonb("capabilities").notNull(),
  model: text("model").notNull(),
  tools: jsonb("tools").notNull(),
  permissions: jsonb("permissions").notNull(),
  status: text("status").notNull(),
  score: real("score").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  name: text("name").notNull(),
  rule: jsonb("rule").notNull(),
  decision: text("decision").notNull(),
  severity: text("severity").notNull(),
  enabled: integer("enabled").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const missions = pgTable("missions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  projectId: text("project_id").notNull(),
  title: text("title").notNull(),
  intent: text("intent").notNull(),
  status: text("status").notNull(),
  riskLevel: text("risk_level").notNull(),
  autonomyLevel: integer("autonomy_level").notNull(),
  context: jsonb("context").notNull(),
  scope: jsonb("scope").notNull(),
  constraints: jsonb("constraints").notNull(),
  successCriteria: jsonb("success_criteria").notNull(),
  humanApproval: jsonb("human_approval").notNull(),
  plan: jsonb("plan"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true })
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  missionId: text("mission_id"),
  approver: text("approver").notNull(),
  role: text("role").notNull(),
  decision: text("decision").notNull(),
  scope: jsonb("scope").notNull(),
  reason: text("reason").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  missionId: text("mission_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").notNull(),
  createdBy: text("created_by").notNull().default("system"),
  hash: text("hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  projectId: text("project_id"),
  missionId: text("mission_id"),
  actorId: text("actor_id").notNull().default("system"),
  agentId: text("agent_id"),
  eventType: text("event_type").notNull(),
  autonomyLevel: integer("autonomy_level").notNull(),
  scope: jsonb("scope").notNull(),
  reason: text("reason").notNull(),
  policyDecision: text("policy_decision").notNull(),
  humanApprovalId: text("human_approval_id"),
  result: text("result").notNull(),
  metadata: jsonb("metadata").notNull(),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const memoryItems = pgTable("memory_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  projectId: text("project_id"),
  type: text("type").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  confidence: real("confidence").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const evaluations = pgTable("evaluations", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  missionId: text("mission_id"),
  scores: jsonb("scores").notNull(),
  decision: text("decision").notNull(),
  findings: jsonb("findings").notNull(),
  requiredFollowups: jsonb("required_followups").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const improvementProposals = pgTable("improvement_proposals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  target: text("target").notNull(),
  changeType: text("change_type").notNull(),
  rationale: text("rationale").notNull(),
  proposedChange: text("proposed_change").notNull(),
  expectedGain: jsonb("expected_gain").notNull(),
  risk: text("risk").notNull(),
  evaluationPlan: jsonb("evaluation_plan").notNull(),
  rollbackPlan: jsonb("rollback_plan").notNull(),
  approvalRequiredFrom: jsonb("approval_required_from").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
});

export const patchProposals = pgTable("patch_proposals", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  missionId: text("mission_id").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  files: jsonb("files").notNull(),
  unifiedDiff: text("unified_diff").notNull(),
  riskLevel: text("risk_level").notNull(),
  generatedBy: text("generated_by").notNull(),
  agentRole: text("agent_role").notNull(),
  status: text("status").notNull(),
  policyDecision: text("policy_decision").notNull(),
  policyFindings: jsonb("policy_findings").notNull(),
  evidenceId: text("evidence_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true })
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  type: text("type").notNull(),
  projectId: text("project_id").notNull(),
  missionId: text("mission_id"),
  status: text("status").notNull(),
  input: jsonb("input").notNull(),
  result: jsonb("result"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(1),
  idempotencyKey: text("idempotency_key"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true })
});

export const tools = pgTable("tools", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  command: text("command"),
  inputSchema: jsonb("input_schema").notNull(),
  outputSchema: jsonb("output_schema").notNull(),
  risk: text("risk").notNull(),
  allowedRoles: jsonb("allowed_roles").notNull().default([]),
  requiresApproval: integer("requires_approval").notNull().default(0),
  requiresSandbox: integer("requires_sandbox").notNull().default(0),
  auditEventType: text("audit_event_type").notNull().default("tool_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull()
});

export const workflowRuns = pgTable("workflow_runs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull().default("org.default"),
  missionId: text("mission_id"),
  workflow: text("workflow").notNull(),
  status: text("status").notNull(),
  gates: jsonb("gates").notNull(),
  evidenceRequired: jsonb("evidence_required").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
});
