import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import cors from "@fastify/cors";
import {
  approvalSchema,
  applyPatchSchema,
  agentRunSchema,
  createMissionSchema,
  createProjectSchema,
  evidenceSchema,
  enqueueJobSchema,
  improvementProposalSchema,
  loginSchema,
  policyActionSchema,
  proposePatchSchema,
  signupSchema
} from "@agentops/shared";
import { and, desc, eq } from "drizzle-orm";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { db, sql } from "./db/client.js";
import { migrate } from "./db/migrate.js";
import { ApiError } from "./http/errors.js";
import { configureHttpSecurity, isOriginAllowed } from "./http/security.js";
import {
  agents,
  approvals,
  auditEvents,
  evaluations,
  evidence,
  improvementProposals,
  jobs,
  memoryItems,
  missions,
  organizations,
  patchProposals,
  policies,
  projects,
  userAccounts,
  userSessions
} from "./db/schema.js";
import { createEvidenceRecord } from "./services/evidenceService.js";
import { id, improvementId, missionId } from "./services/ids.js";
import { initializeKernel } from "./services/kernel.js";
import {
  closeMission,
  getMissionOrThrow,
  planMission,
  recordMissionApproval
} from "./services/missionService.js";
import { blocksExecution } from "./services/missionRules.js";
import { evaluatePolicy } from "./services/policy.js";
import { enqueueJob, getJobOrThrow, listJobs } from "./services/jobService.js";
import { markPatchReadyToApply, proposePatch } from "./services/patchService.js";
import { seedDefaults } from "./services/seed.js";
import { InvalidMissionTransitionError } from "./services/stateMachine.js";
import { builtInProviders } from "./services/modelProviders.js";
import { toolDescriptors } from "./services/toolRegistry.js";
import { writeAuditEvent } from "./services/audit.js";
import { findRustCoreBinary } from "./services/rustCore.js";
import { isRustCoreRequired } from "./services/readiness.js";

const scrypt = promisify(scryptCallback);
const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;

export async function buildApp() {
const app = Fastify({ logger: true, bodyLimit: config.httpBodyLimitBytes });

await app.register(cors, {
  credentials: Boolean(config.operatorToken),
  origin: (origin, callback) => {
    callback(null, isOriginAllowed(origin, config.httpAllowedOrigins, config.appEnv));
  }
});

configureHttpSecurity(app, {
  appEnv: config.appEnv,
  allowedOrigins: config.httpAllowedOrigins,
  operatorToken: config.operatorToken,
  rateLimitWindowMs: config.rateLimitWindowMs,
  rateLimitMax: config.rateLimitMax,
  userTokenVerifier: async (token) => verifySessionToken(token)
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof ApiError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? {},
        request_id: request.id
      }
    });
  }

  if (error instanceof InvalidMissionTransitionError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
        details: { from: error.from, to: error.to },
        request_id: request.id
      }
    });
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: { issues: error.issues },
        request_id: request.id
      }
    });
  }

  request.log.error(error);
  return reply.code(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error.",
      details: {},
      request_id: request.id
    }
  });
});

app.get("/live", async () => ({
  ok: true,
  service: "agentops-api",
  environment: config.appEnv
}));

app.get("/ready", async (_request, reply) => {
  const readiness = await getReadiness();
  return reply.code(readiness.ok ? 200 : 503).send(readiness);
});

app.get("/health", async (_request, reply) => {
  const readiness = await getReadiness();
  return reply.code(readiness.ok ? 200 : 503).send(readiness);
});

app.post("/v1/auth/signup", async (request, reply) => {
  const body = signupSchema.parse(request.body);
  const email = normalizeEmail(body.email);
  const existing = await db.select({ id: userAccounts.id }).from(userAccounts).where(eq(userAccounts.email, email));
  if (existing.length > 0) {
    throw new ApiError(409, "EMAIL_ALREADY_REGISTERED", "This email is already registered.");
  }

  const now = new Date();
  const organizationId = id("org");
  const projectId = `com.agentops.${slug(body.organization_name)}.${randomBytes(3).toString("hex")}`;

  await db.insert(organizations).values({
    id: organizationId,
    name: body.organization_name,
    plan: "team",
    createdAt: now,
    updatedAt: now
  });

  await db.insert(projects).values({
    id: projectId,
    organizationId,
    name: `${body.organization_name} workspace`,
    type: "agentic_operations",
    criticality: "medium",
    owners: { product: email, technical: email },
    repos: [],
    createdAt: now,
    updatedAt: now
  });

  const user = {
    id: id("usr"),
    organizationId,
    email,
    name: body.name,
    passwordHash: await hashPassword(body.password),
    role: "owner",
    language: body.language,
    status: "active",
    createdAt: now,
    updatedAt: now
  };

  await db.insert(userAccounts).values(user);
  await writeAuditEvent({
    projectId,
    actorId: user.id,
    eventType: "user_signup",
    reason: `Workspace created for ${body.organization_name}`,
    metadata: { user_id: user.id, organization_id: organizationId }
  });

  const token = await createSession(user.id, organizationId);
  return reply.code(201).send({
    token,
    user: publicUser(user),
    organization: { id: organizationId, name: body.organization_name },
    project: { id: projectId, name: `${body.organization_name} workspace` }
  });
});

app.post("/v1/auth/login", async (request) => {
  const body = loginSchema.parse(request.body);
  const [user] = await db.select().from(userAccounts).where(eq(userAccounts.email, normalizeEmail(body.email)));
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new ApiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }
  if (user.status !== "active") {
    throw new ApiError(403, "USER_DISABLED", "This account is not active.");
  }
  const token = await createSession(user.id, user.organizationId);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  return { token, user: publicUser(user), organization };
});

app.get("/v1/auth/me", async (request) => {
  const { user } = await requireUserSession(request.headers.authorization);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, user.organizationId));
  return { user: publicUser(user), organization };
});

app.post("/v1/auth/logout", async (request) => {
  const token = extractBearerToken(request.headers.authorization);
  if (token) {
    await db
      .update(userSessions)
      .set({ revokedAt: new Date(), lastSeenAt: new Date() })
      .where(eq(userSessions.tokenHash, hashToken(token)));
  }
  return { ok: true };
});

app.post("/v1/bootstrap", async () => {
  const kernelFilesInitialized = shouldInitializeKernelFiles();
  if (kernelFilesInitialized) {
    await initializeKernel();
  }
  const projectId = await seedDefaults();
  await writeAuditEvent({
    projectId,
    eventType: "bootstrap",
    reason: "AgentOps kernel and seed data initialized",
    metadata: { projectRoot: config.projectRoot, kernel_files_initialized: kernelFilesInitialized }
  });
  return { project_id: projectId };
});

app.get("/v1/overview", async (request) => {
  const organizationId = await resolveOrganizationId(request.headers.authorization);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
  const [project] = await db.select().from(projects).where(eq(projects.organizationId, organizationId)).limit(1);
  const allMissions = await db
    .select()
    .from(missions)
    .where(eq(missions.organizationId, organizationId))
    .orderBy(desc(missions.createdAt));
  const allAgents = await db.select().from(agents).where(eq(agents.organizationId, organizationId));
  const allPolicies = await db.select().from(policies).where(eq(policies.organizationId, organizationId));
  const allApprovals = await db
    .select()
    .from(approvals)
    .where(eq(approvals.organizationId, organizationId))
    .orderBy(desc(approvals.createdAt));
  const allEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.organizationId, organizationId))
    .orderBy(desc(evidence.createdAt));
  const allAudit = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(30);
  const allMemory = await db
    .select()
    .from(memoryItems)
    .where(eq(memoryItems.organizationId, organizationId))
    .orderBy(desc(memoryItems.createdAt))
    .limit(20);
  const allEvaluations = await db
    .select()
    .from(evaluations)
    .where(eq(evaluations.organizationId, organizationId))
    .orderBy(desc(evaluations.createdAt));
  const allPatches = await db
    .select()
    .from(patchProposals)
    .where(eq(patchProposals.organizationId, organizationId))
    .orderBy(desc(patchProposals.createdAt));
  const allJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.organizationId, organizationId))
    .orderBy(desc(jobs.createdAt))
    .limit(30);
  const allImprovements = await db
    .select()
    .from(improvementProposals)
    .where(eq(improvementProposals.organizationId, organizationId))
    .orderBy(desc(improvementProposals.createdAt));

  return {
    organization,
    project,
    missions: allMissions,
    agents: allAgents,
    policies: allPolicies,
    approvals: allApprovals,
    evidence: allEvidence,
    audit: allAudit,
    memory: allMemory,
    evaluations: allEvaluations,
    patches: allPatches,
    jobs: allJobs,
    improvements: allImprovements
  };
});

app.get("/v1/projects", async (request) => {
  const organizationId = await resolveOrganizationId(request.headers.authorization);
  return db.select().from(projects).where(eq(projects.organizationId, organizationId)).orderBy(desc(projects.createdAt));
});

app.post("/v1/projects", async (request, reply) => {
  const body = createProjectSchema.parse(request.body);
  const organizationId = await resolveOrganizationId(request.headers.authorization);
  const project = {
    id: body.id ?? `com.agentops.${slug(body.name)}`,
    organizationId,
    name: body.name,
    type: body.type,
    criticality: body.criticality,
    owners: body.owners,
    repos: body.repos,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await db.insert(projects).values(project);
  await writeAuditEvent({
    projectId: project.id,
    eventType: "project_created",
    reason: `Project ${project.name} registered`
  });
  return reply.code(201).send(project);
});

app.get("/v1/projects/:projectId", async (request, reply) => {
  const { projectId } = request.params as { projectId: string };
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return reply.code(404).send({ error: "Project not found" });
  return project;
});

app.post("/v1/projects/:projectId/missions", async (request, reply) => {
  const { projectId } = request.params as { projectId: string };
  const body = createMissionSchema.parse(request.body);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return reply.code(404).send({ error: "Project not found" });

  const mission = {
    id: missionId(),
    organizationId: project.organizationId,
    projectId,
    title: body.title,
    intent: body.intent,
    status: "DRAFT",
    riskLevel: body.risk_level,
    autonomyLevel: body.autonomy_level,
    context: body.context,
    scope: body.scope,
    constraints: body.constraints,
    successCriteria: body.success_criteria,
    humanApproval: body.human_approval,
    plan: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    closedAt: null
  };

  await db.insert(missions).values(mission);
  await writeAuditEvent({
    projectId,
    missionId: mission.id,
    eventType: "mission_created",
    autonomyLevel: mission.autonomyLevel,
    scope: mission.scope,
    reason: mission.intent
  });
  return reply.code(201).send(mission);
});

app.get("/v1/missions/:missionId", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const [mission] = await db.select().from(missions).where(eq(missions.id, missionId));
  if (!mission) return reply.code(404).send({ error: "Mission not found" });
  const missionEvidence = await db.select().from(evidence).where(eq(evidence.missionId, missionId));
  const missionApprovals = await db
    .select()
    .from(approvals)
    .where(eq(approvals.missionId, missionId));
  const missionAudit = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.missionId, missionId))
    .orderBy(desc(auditEvents.createdAt));
  const missionPatches = await db
    .select()
    .from(patchProposals)
    .where(eq(patchProposals.missionId, missionId))
    .orderBy(desc(patchProposals.createdAt));
  return {
    mission,
    evidence: missionEvidence,
    approvals: missionApprovals,
    audit: missionAudit,
    patches: missionPatches
  };
});

app.post("/v1/missions/:missionId/plan", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const result = await planMission(mission);
  await writeAuditEvent({
    projectId: result.mission.projectId,
    missionId: result.mission.id,
    agentId: "agent.planner",
    eventType: "mission_planned",
    autonomyLevel: result.mission.autonomyLevel,
    scope: result.mission.scope as Record<string, unknown>,
    reason: "Plan generated from canonical AgentOps workflow",
    metadata: { final_status: result.mission.status }
  });
  return { ...result.mission, plan: result.plan };
});

app.post("/v1/missions/:missionId/approve", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const body = approvalSchema.parse(request.body);
  const result = await recordMissionApproval(mission, body);

  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    eventType: "mission_approval",
    autonomyLevel: mission.autonomyLevel,
    reason: body.reason,
    humanApprovalId: result.approval.id,
    result: body.decision,
    metadata: { mission_status: result.mission.status, scope: body.scope }
  });
  return result.approval;
});

app.post("/v1/missions/:missionId/execute", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const body = (request.body ?? {}) as { command?: string; agent_id?: string };

  const command = body.command?.trim() || "npm run test";
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
      agentId: body.agent_id ?? "agent.tester",
      eventType: "execution_blocked",
      autonomyLevel: mission.autonomyLevel,
      policyDecision: policy.decision,
      reason: policy.reason,
      result: "blocked"
    });
    return reply.code(409).send({ policy });
  }

  const job = await enqueueJob({
    type: "tool.run_command",
    project_id: mission.projectId,
    mission_id: mission.id,
    input: { command, agent_id: body.agent_id ?? "agent.tester" },
    max_attempts: 1
  });
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    agentId: body.agent_id ?? "agent.tester",
    actorId: body.agent_id ?? "agent.tester",
    eventType: "job_enqueued",
    autonomyLevel: mission.autonomyLevel,
    policyDecision: policy.decision,
    reason: `Queued ${command}`,
    result: "queued",
    metadata: { job_id: job.id, job_type: job.type, command }
  });
  return reply.code(202).send({ policy, job });
});

app.post("/v1/missions/:missionId/evaluate", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const job = await enqueueJob({
    type: "evaluation.run",
    project_id: mission.projectId,
    mission_id: mission.id,
    input: {},
    max_attempts: 1
  });
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    agentId: "agent.reviewer",
    eventType: "job_enqueued",
    autonomyLevel: mission.autonomyLevel,
    reason: "Queued mission evaluation",
    result: "queued",
    metadata: { job_id: job.id, job_type: job.type }
  });
  return reply.code(202).send({ job });
});

app.post("/v1/missions/:missionId/close", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const updatedMission = await closeMission(mission);
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    eventType: "mission_closed",
    autonomyLevel: mission.autonomyLevel,
    reason: "Mission closed with acceptable evaluation and evidence attached"
  });
  return { id: mission.id, status: updatedMission.status };
});

app.get("/v1/agents", async () => db.select().from(agents).orderBy(agents.role));

app.get("/v1/tools", async () => toolDescriptors);

app.get("/v1/model-providers", async () =>
  builtInProviders.map((provider) => ({
    id: provider.id,
    kind: provider.kind,
    capabilities: provider.capabilities
  }))
);

app.get("/v1/jobs", async (request) => {
  const query = request.query as { mission_id?: string };
  return listJobs(query.mission_id);
});

app.get("/v1/jobs/:jobId", async (request) => {
  return getJobOrThrow((request.params as { jobId: string }).jobId);
});

app.post("/v1/jobs", async (request, reply) => {
  const body = enqueueJobSchema.parse(request.body);
  const job = await enqueueJob(body);
  await writeAuditEvent({
    projectId: body.project_id,
    missionId: body.mission_id ?? null,
    eventType: "job_enqueued",
    reason: `Queued ${body.type}`,
    result: "queued",
    metadata: { job_id: job.id, job_type: job.type }
  });
  return reply.code(202).send(job);
});

app.post("/v1/missions/:missionId/agents/run", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const body = agentRunSchema.parse(request.body);
  const job = await enqueueJob({
    type: "agent.run",
    project_id: mission.projectId,
    mission_id: mission.id,
    input: body,
    max_attempts: 1
  });
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: body.requested_by,
    agentId: `agent.${body.role}`,
    eventType: "job_enqueued",
    autonomyLevel: mission.autonomyLevel,
    reason: `Queued deterministic ${body.role} agent`,
    result: "queued",
    metadata: { job_id: job.id, job_type: job.type, role: body.role }
  });
  return reply.code(202).send({ job });
});

app.get("/v1/policies/evaluate", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  const action = policyActionSchema.parse({
    type: query.type ?? "file_read",
    path: query.path,
    command: query.command,
    agent_role: query.agent_role,
    autonomy_level: Number(query.autonomy_level ?? 2),
    risk_level: query.risk_level ?? "medium"
  });
  return evaluatePolicy(action);
});

app.post("/v1/policies/evaluate", async (request) => {
  const action = policyActionSchema.parse(request.body);
  return evaluatePolicy(action);
});

app.post("/v1/evidence", async (request, reply) => {
  const body = evidenceSchema.parse(request.body);
  const [mission] = await db.select().from(missions).where(eq(missions.id, body.mission_id));
  if (!mission) return reply.code(404).send({ error: "Mission not found" });
  const proof = await createEvidenceRecord({
    missionId: body.mission_id,
    type: body.type,
    title: body.title,
    content: body.content,
    metadata: body.metadata,
    createdBy: body.created_by
  });
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: body.created_by,
    eventType: "evidence_attached",
    autonomyLevel: mission.autonomyLevel,
    reason: body.title,
    metadata: { evidence_id: proof.id, hash: proof.hash }
  });
  return reply.code(201).send(proof);
});

app.post("/v1/missions/:missionId/patches/propose", async (request, reply) => {
  const mission = await getMissionOrThrow((request.params as { missionId: string }).missionId);
  const body = proposePatchSchema.parse(request.body);
  const result = await proposePatch(mission, body);
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: body.generated_by,
    agentId: body.generated_by,
    eventType: "patch_proposed",
    autonomyLevel: mission.autonomyLevel,
    policyDecision: result.policy.decision,
    reason: body.summary,
    metadata: {
      patch_id: result.proposal.id,
      evidence_id: result.evidence.id,
      files: body.files,
      policy_findings: result.policy.findings
    }
  });
  return reply.code(201).send(result);
});

app.post("/v1/patches/:patchId/apply", async (request) => {
  const patchId = (request.params as { patchId: string }).patchId;
  const body = applyPatchSchema.parse(request.body);
  const proposal = await markPatchReadyToApply(patchId, body.agent_role);
  const mission = await getMissionOrThrow(proposal.missionId);
  await writeAuditEvent({
    projectId: mission.projectId,
    missionId: mission.id,
    actorId: body.actor_id,
    agentId: body.agent_role ? `agent.${body.agent_role}` : null,
    eventType: "patch_apply_guarded",
    autonomyLevel: mission.autonomyLevel,
    policyDecision: proposal.policyDecision,
    reason: body.reason,
    metadata: {
      patch_id: proposal.id,
      status: proposal.status,
      role: body.role,
      note: "Patch marked ready for guarded application; no direct filesystem mutation performed."
    }
  });
  return {
    patch: proposal,
    note: "Patch is ready for guarded application. Files were not mutated by the API."
  };
});

app.get("/v1/audit", async (request) => {
  const query = request.query as { mission_id?: string };
  if (query.mission_id) {
    return db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.missionId, query.mission_id))
      .orderBy(desc(auditEvents.createdAt));
  }
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100);
});

app.post("/v1/improvements/propose", async (request, reply) => {
  const body = improvementProposalSchema.parse(request.body);
  const proposal = {
    id: improvementId(),
    target: body.target,
    changeType: body.change_type,
    rationale: body.rationale,
    proposedChange: body.proposed_change,
    expectedGain: body.expected_gain,
    risk: body.risk,
    evaluationPlan: body.evaluation_plan,
    rollbackPlan: body.rollback_plan,
    approvalRequiredFrom: body.approval_required_from,
    status: "proposed",
    createdAt: new Date(),
    appliedAt: null
  };
  await db.insert(improvementProposals).values(proposal);
  await writeAuditEvent({
    eventType: "improvement_proposed",
    agentId: "agent.metadev",
    autonomyLevel: 8,
    policyDecision: "require_approval",
    reason: body.rationale,
    metadata: { proposal_id: proposal.id, target: proposal.target }
  });
  return reply.code(201).send(proposal);
});

app.post("/v1/improvements/:id/approve", async (request, reply) => {
  const proposalId = (request.params as { id: string }).id;
  const body = approvalSchema.parse(request.body);
  const [proposal] = await db
    .select()
    .from(improvementProposals)
    .where(eq(improvementProposals.id, proposalId));
  if (!proposal) return reply.code(404).send({ error: "Improvement proposal not found" });
  await db
    .update(improvementProposals)
    .set({ status: body.decision === "approved" ? "approved" : "rejected" })
    .where(eq(improvementProposals.id, proposalId));
  await writeAuditEvent({
    eventType: "improvement_approval",
    autonomyLevel: 8,
    humanApprovalId: id("appr"),
    result: body.decision,
    reason: body.reason,
    metadata: { proposal_id: proposalId }
  });
  return { id: proposalId, status: body.decision === "approved" ? "approved" : "rejected" };
});

app.post("/v1/improvements/:id/apply", async (request, reply) => {
  const proposalId = (request.params as { id: string }).id;
  const [proposal] = await db
    .select()
    .from(improvementProposals)
    .where(and(eq(improvementProposals.id, proposalId), eq(improvementProposals.status, "approved")));
  if (!proposal) {
    return reply.code(409).send({
      error: "Improvement must exist and be approved before apply"
    });
  }
  await db
    .update(improvementProposals)
    .set({ status: "ready_to_apply", appliedAt: null })
    .where(eq(improvementProposals.id, proposalId));
  await writeAuditEvent({
    eventType: "improvement_apply_guarded",
    autonomyLevel: 9,
    policyDecision: "require_approval",
    reason: "AgentOps v1 records application intent; file mutation remains guarded.",
    metadata: { proposal_id: proposalId, rollback_plan: proposal.rollbackPlan }
  });
  return {
    id: proposalId,
    status: "ready_to_apply",
    note: "Application is guarded; policy/governance files still require explicit human-controlled patch."
  };
});

return app;
}

export interface BootstrapOptions {
  runMigrations?: boolean;
  initializeKernelFiles?: boolean;
  seed?: boolean;
}

export async function bootstrapApplication(options: BootstrapOptions = {}) {
  const {
    runMigrations = true,
    initializeKernelFiles = shouldInitializeKernelFiles(),
    seed = true
  } = options;

  if (runMigrations) await migrate();
  if (initializeKernelFiles) await initializeKernel();
  if (!seed) return undefined;
  return seedDefaults();
}

export async function getReadiness() {
  const rustCoreRequired = isRustCoreRequired(config.policyEngine, config.sandboxEngine);
  const checks = {
    database: false,
    auth_schema: false,
    rust_core: Boolean(findRustCoreBinary()),
    rust_core_required: rustCoreRequired,
    default_organization: Boolean(config.defaultOrganizationId),
    policy_engine: config.policyEngine,
    sandbox_engine: config.sandboxEngine
  };

  try {
    await sql`select 1`;
    checks.database = true;
    const [authSchema] = await sql<{ ready: boolean }[]>`
      select (
        to_regclass('public.user_accounts') is not null
        and to_regclass('public.user_sessions') is not null
      ) as ready
    `;
    checks.auth_schema = Boolean(authSchema?.ready);
  } catch {
    checks.database = false;
    checks.auth_schema = false;
  }

  return {
    ok: checks.database && checks.auth_schema && checks.default_organization && (!rustCoreRequired || checks.rust_core),
    service: "agentops-api",
    environment: config.appEnv,
    database: "postgresql",
    checks
  };
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
}

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(userId: string, organizationId: string) {
  const token = `aos_${randomBytes(32).toString("base64url")}`;
  const now = new Date();
  await db.insert(userSessions).values({
    id: id("ses"),
    userId,
    organizationId,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + sessionTtlMs),
    revokedAt: null,
    createdAt: now,
    lastSeenAt: now
  });
  return token;
}

async function verifySessionToken(token: string) {
  if (!token.startsWith("aos_")) return false;
  const [session] = await db.select().from(userSessions).where(eq(userSessions.tokenHash, hashToken(token)));
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return false;
  await db.update(userSessions).set({ lastSeenAt: new Date() }).where(eq(userSessions.id, session.id));
  return true;
}

async function requireUserSession(authorization: string | string[] | undefined) {
  const token = extractBearerToken(authorization);
  if (!token) throw new ApiError(401, "AUTH_REQUIRED", "Sign in required.");
  const [session] = await db.select().from(userSessions).where(eq(userSessions.tokenHash, hashToken(token)));
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new ApiError(401, "SESSION_EXPIRED", "Session expired. Sign in again.");
  }
  const [user] = await db.select().from(userAccounts).where(eq(userAccounts.id, session.userId));
  if (!user || user.status !== "active") {
    throw new ApiError(401, "SESSION_INVALID", "Session invalid.");
  }
  await db.update(userSessions).set({ lastSeenAt: new Date() }).where(eq(userSessions.id, session.id));
  return { session, user };
}

async function resolveOrganizationId(authorization: string | string[] | undefined) {
  const token = extractBearerToken(authorization);
  if (!token?.startsWith("aos_")) return config.defaultOrganizationId;
  const { user } = await requireUserSession(authorization);
  return user.organizationId;
}

function extractBearerToken(value: string | string[] | undefined) {
  const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

function publicUser(user: typeof userAccounts.$inferSelect) {
  return {
    id: user.id,
    organization_id: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language
  };
}

function shouldInitializeKernelFiles() {
  return process.env.AGENTOPS_KERNEL_FILES !== "disabled" && !process.env.AWS_LAMBDA_FUNCTION_NAME;
}
