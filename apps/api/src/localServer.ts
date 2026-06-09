import cors from "@fastify/cors";
import {
  agentRunSchema,
  approvalSchema,
  applyPatchSchema,
  createMissionSchema,
  createProjectSchema,
  enqueueJobSchema,
  evidenceSchema,
  improvementProposalSchema,
  loginSchema,
  policyActionSchema,
  proposePatchSchema,
  signupSchema
} from "@agentops/shared";
import Fastify from "fastify";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z, ZodError } from "zod";
import { config } from "./config.js";
import { evaluatePolicy } from "./services/policy.js";

type Row = Record<string, unknown>;

interface LocalStore {
  organization: Row;
  project: Row;
  missions: Row[];
  agents: Row[];
  policies: Row[];
  approvals: Row[];
  evidence: Row[];
  audit: Row[];
  memory: Row[];
  evaluations: Row[];
  improvements: Row[];
  patches: Row[];
  jobs: Row[];
  users: Row[];
  sessions: Row[];
}

const storePath =
  process.env.AGENTOPS_LOCAL_STORE_PATH ?? path.join(config.projectRoot, ".agentops/local-store.json");
const blobStoreName = process.env.AGENTOPS_BLOBS_STORE ?? "agentops-production";
const blobStoreKey = process.env.AGENTOPS_BLOBS_STORE_KEY ?? "local-store.json";
const fileReadLimitBytes = 512_000;
const terminalOutputLimitBytes = 80_000;
const terminalTimeoutMs = 45_000;

const ideFileQuerySchema = z.object({
  path: z.string().default("")
});

const saveFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  mission_id: z.string().optional(),
  actor_id: z.string().min(2).default("human.operator")
});

const terminalRunSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().default(""),
  mission_id: z.string().optional(),
  actor_id: z.string().min(2).default("human.operator")
});

const localPatchApplySchema = z.object({
  unified_diff: z.string().min(1),
  mission_id: z.string().optional(),
  actor_id: z.string().min(2).default("human.operator"),
  confirmed: z.boolean().default(false)
});

const app = Fastify({ logger: true, bodyLimit: config.httpBodyLimitBytes });

await app.register(cors, {
  credentials: false,
  origin: true
});

app.setErrorHandler((error, request, reply) => {
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
      code: "LOCAL_API_ERROR",
      message: error instanceof Error ? error.message : "Local API error.",
      details: {},
      request_id: request.id
    }
  });
});

app.get("/live", async () => ({
  ok: true,
  service: "agentops-local-api",
  environment: "local_file"
}));

const localReadiness = {
  ok: true,
  service: "agentops-local-api",
  environment: useBlobStore() ? "netlify_blobs" : "local_file",
  database: useBlobStore() ? "netlify_blobs" : "local_json",
  store_path: useBlobStore() ? `${blobStoreName}/${blobStoreKey}` : storePath,
  checks: {
    database: true,
    auth_schema: true,
    rust_core: true,
    default_organization: true,
    policy_engine: "deterministic",
    sandbox_engine: "simulated_local"
  }
};

app.get("/ready", async () => localReadiness);

app.get("/health", async () => localReadiness);

app.post("/v1/auth/signup", async (request, reply) => {
  const body = signupSchema.parse(request.body);
  const email = body.email.trim().toLowerCase();
  const store = await mutate((draft) => {
    if (draft.users.some((user) => user.email === email)) throw new Error("This email is already registered.");
    const organization = {
      id: prefixedId("org"),
      name: body.organization_name,
      plan: "local",
      createdAt: now(),
      updatedAt: now()
    };
    const project = {
      id: `com.agentops.${slug(body.organization_name)}.${randomUUID().slice(0, 6)}`,
      organizationId: organization.id,
      name: `${body.organization_name} workspace`,
      type: "agentic_operations",
      criticality: "medium",
      owners: { product: email, technical: email },
      repos: [`local:${config.projectRoot}`],
      createdAt: now(),
      updatedAt: now()
    };
    const user = {
      id: prefixedId("usr"),
      organizationId: organization.id,
      email,
      name: body.name,
      passwordHash: localPasswordHash(body.password),
      role: "owner",
      language: body.language,
      status: "active",
      createdAt: now(),
      updatedAt: now()
    };
    draft.organization = organization;
    draft.project = project;
    draft.users = [user];
    draft.sessions = [];
    draft.missions = [];
    draft.agents = defaultAgents(organization.id);
    draft.policies = defaultPolicies();
    draft.approvals = [];
    draft.evidence = [];
    draft.audit = [];
    draft.memory = [];
    draft.evaluations = [];
    draft.improvements = [];
    draft.patches = [];
    draft.jobs = [];
    audit(draft, {
      projectId: project.id,
      actorId: user.id,
      eventType: "local_user_signup",
      reason: `Local workspace created for ${body.organization_name}`,
      metadata: { user_id: user.id }
    });
  });
  const user = store.users[0];
  const token = await createLocalSession(user, store);
  return reply.code(201).send({
    token,
    user: publicUser(user),
    organization: store.organization,
    project: store.project
  });
});

app.post("/v1/auth/login", async (request) => {
  const body = loginSchema.parse(request.body);
  const email = body.email.trim().toLowerCase();
  const store = await loadStore();
  const user = store.users.find((item) => item.email === email);
  if (!user || user.passwordHash !== localPasswordHash(body.password)) {
    throw new Error("Email or password is incorrect.");
  }
  const token = await createLocalSession(user, store);
  return { token, user: publicUser(user), organization: store.organization };
});

app.get("/v1/auth/me", async (request, reply) => {
  const user = await localUserFromAuthorization(request.headers.authorization);
  if (!user) return reply.code(401).send({ error: { code: "SESSION_EXPIRED", message: "Session expired." } });
  const store = await loadStore();
  return { user: publicUser(user), organization: store.organization };
});

app.post("/v1/auth/logout", async (request) => {
  const token = bearerToken(request.headers.authorization);
  if (!token) return { ok: true };
  await mutate((draft) => {
    draft.sessions = draft.sessions.filter((session) => session.token !== token);
  });
  return { ok: true };
});

app.post("/v1/bootstrap", async () => {
  const store = await loadStore();
  await saveStore(store);
  return { project_id: store.project.id, store_path: storePath };
});

app.get("/v1/overview", async () => overview(await loadStore()));

app.get("/v1/projects", async () => [overviewProject(await loadStore())]);

app.post("/v1/projects", async (request, reply) => {
  const body = createProjectSchema.parse(request.body);
  const project = {
    id: body.id ?? `com.agentops.${slug(body.name)}`,
    organizationId: body.organization_id,
    name: body.name,
    type: body.type,
    criticality: body.criticality,
    owners: body.owners,
    repos: body.repos,
    createdAt: now(),
    updatedAt: now()
  };
  const store = await mutate((draft) => {
    draft.project = project;
    audit(draft, {
      projectId: project.id,
      eventType: "project_created",
      reason: `Project ${project.name} registered in local mode.`
    });
  });
  return reply.code(201).send(store.project);
});

app.get("/v1/projects/:projectId", async (request, reply) => {
  const { projectId } = request.params as { projectId: string };
  const store = await loadStore();
  if (store.project.id !== projectId) return reply.code(404).send({ error: "Project not found" });
  return store.project;
});

app.post("/v1/projects/:projectId/missions", async (request, reply) => {
  const { projectId } = request.params as { projectId: string };
  const body = createMissionSchema.parse(request.body);
  const store = await mutate((draft) => {
    if (draft.project.id !== projectId) throw new Error("Project not found");
    const mission = {
      id: `AOS-MIS-${Date.now().toString(36).toUpperCase()}`,
      organizationId: draft.organization.id,
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
      createdAt: now(),
      updatedAt: now(),
      closedAt: null
    };
    draft.missions.unshift(mission);
    audit(draft, {
      projectId,
      missionId: mission.id,
      eventType: "mission_created",
      autonomyLevel: mission.autonomyLevel,
      reason: mission.intent,
      metadata: { local_mode: true }
    });
  });
  return reply.code(201).send(store.missions[0]);
});

app.get("/v1/missions/:missionId", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const store = await loadStore();
  const mission = findMission(store, missionId);
  if (!mission) return reply.code(404).send({ error: "Mission not found" });
  return {
    mission,
    evidence: store.evidence.filter((item) => item.missionId === missionId),
    approvals: store.approvals.filter((item) => item.missionId === missionId),
    audit: store.audit.filter((item) => item.missionId === missionId),
    patches: store.patches.filter((item) => item.missionId === missionId)
  };
});

app.post("/v1/missions/:missionId/plan", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    mission.status = "WAITING_APPROVAL";
    mission.plan = {
      steps: [
        "Scope the mission and risk surface.",
        "Generate a governed patch proposal.",
        "Run sandbox checks and capture evidence.",
        "Request human approval before guarded application."
      ],
      generatedBy: "agent.planner",
      generatedAt: now()
    };
    mission.updatedAt = now();
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      agentId: "agent.planner",
      eventType: "mission_planned",
      autonomyLevel: mission.autonomyLevel,
      policyDecision: "require_approval",
      reason: "Local planner generated a governed mission plan."
    });
  });
  const mission = requireMission(store, missionId);
  return reply.send(mission);
});

app.post("/v1/missions/:missionId/agents/run", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const body = agentRunSchema.parse(request.body);
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    const job = createJob("agent.run", mission, body, "succeeded");
    draft.jobs.unshift(job);
    const proof = createEvidence(mission, {
      type: "report",
      title: `${body.role} agent result`,
      content: `Deterministic local ${body.role} agent completed. Next step: keep patch, tests and approval evidence attached before deployment.`,
      metadata: { role: body.role, requested_by: body.requested_by, provider: body.provider_id ?? "local" },
      createdBy: body.requested_by
    });
    draft.evidence.unshift(proof);
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      actorId: body.requested_by,
      agentId: `agent.${body.role}`,
      eventType: "job_completed",
      autonomyLevel: mission.autonomyLevel,
      result: "succeeded",
      metadata: { job_id: job.id, evidence_id: proof.id }
    });
  });
  return reply.code(202).send({ job: store.jobs[0] });
});

app.post("/v1/missions/:missionId/execute", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const body = (request.body ?? {}) as { command?: string; agent_id?: string };
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    const command = body.command?.trim() || "npm run test";
    const policy = evaluatePolicy({
      type: "command_execute",
      command,
      agent_role: "tester",
      autonomy_level: Number(mission.autonomyLevel ?? 2),
      risk_level: String(mission.riskLevel ?? "medium") as never
    });
    const job = createJob("tool.run_command", mission, { command, agent_id: body.agent_id ?? "agent.tester" }, "succeeded");
    draft.jobs.unshift(job);
    const proof = createEvidence(mission, {
      type: "command_output",
      title: `Sandbox command: ${command}`,
      content: `Local sandbox simulation completed successfully for: ${command}`,
      metadata: { command, job_id: job.id, policy },
      createdBy: body.agent_id ?? "agent.tester"
    });
    draft.evidence.unshift(proof);
    mission.status = "TESTING";
    mission.updatedAt = now();
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      agentId: body.agent_id ?? "agent.tester",
      eventType: "job_completed",
      autonomyLevel: mission.autonomyLevel,
      policyDecision: policy.decision,
      result: "succeeded",
      metadata: { job_id: job.id, evidence_id: proof.id, command }
    });
  });
  return reply.code(202).send({ job: store.jobs[0] });
});

app.post("/v1/missions/:missionId/evaluate", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    const job = createJob("evaluation.run", mission, {}, "succeeded");
    const evaluation = {
      id: prefixedId("eval"),
      missionId,
      score: 0.91,
      passed: true,
      findings: ["Evidence attached", "Approval gate preserved", "Risk remains governed"],
      createdAt: now()
    };
    draft.jobs.unshift(job);
    draft.evaluations.unshift(evaluation);
    mission.status = "HUMAN_REVIEW";
    mission.updatedAt = now();
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      agentId: "agent.reviewer",
      eventType: "evaluation_completed",
      autonomyLevel: mission.autonomyLevel,
      result: "passed",
      metadata: { job_id: job.id, evaluation_id: evaluation.id }
    });
  });
  return reply.code(202).send({ job: store.jobs[0], evaluation: store.evaluations[0] });
});

app.post("/v1/missions/:missionId/approve", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const body = approvalSchema.parse(request.body);
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    const approval = {
      id: prefixedId("appr"),
      missionId,
      approver: body.approver,
      role: body.role,
      decision: body.decision,
      scope: body.scope,
      reason: body.reason,
      createdAt: now()
    };
    mission.status = body.decision === "approved" ? "APPROVED" : "REVISION_REQUIRED";
    mission.updatedAt = now();
    draft.approvals.unshift(approval);
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      actorId: body.approver,
      eventType: "mission_approval",
      humanApprovalId: approval.id,
      result: body.decision,
      reason: body.reason,
      metadata: { scope: body.scope }
    });
  });
  return reply.send(store.approvals[0]);
});

app.post("/v1/evidence", async (request, reply) => {
  const body = evidenceSchema.parse(request.body);
  const store = await mutate((draft) => {
    const mission = requireMission(draft, body.mission_id);
    const proof = createEvidence(mission, {
      type: body.type,
      title: body.title,
      content: body.content,
      metadata: body.metadata,
      createdBy: body.created_by
    });
    draft.evidence.unshift(proof);
    audit(draft, {
      projectId: mission.projectId,
      missionId: mission.id,
      actorId: body.created_by,
      eventType: "evidence_attached",
      reason: body.title,
      metadata: { evidence_id: proof.id, hash: proof.hash }
    });
  });
  return reply.code(201).send(store.evidence[0]);
});

app.post("/v1/missions/:missionId/patches/propose", async (request, reply) => {
  const { missionId } = request.params as { missionId: string };
  const body = proposePatchSchema.parse(request.body);
  const store = await mutate((draft) => {
    const mission = requireMission(draft, missionId);
    const policy = evaluatePolicy({
      type: "file_write",
      path: body.files[0]?.path,
      agent_role: body.agent_role,
      autonomy_level: Number(mission.autonomyLevel ?? 2),
      risk_level: body.risk_level
    });
    const patch = {
      id: prefixedId("patch"),
      missionId,
      title: body.title,
      summary: body.summary,
      files: body.files,
      unifiedDiff: body.unified_diff,
      riskLevel: body.risk_level,
      generatedBy: body.generated_by,
      agentRole: body.agent_role,
      policyDecision: policy.decision,
      policyFindings: [policy.reason],
      status: "waiting_approval",
      createdAt: now(),
      updatedAt: now(),
      appliedAt: null
    };
    const proof = createEvidence(mission, {
      type: "patch",
      title: body.title,
      content: body.unified_diff,
      metadata: { patch_id: patch.id, files: body.files, policy },
      createdBy: body.generated_by
    });
    draft.patches.unshift(patch);
    draft.evidence.unshift(proof);
    audit(draft, {
      projectId: mission.projectId,
      missionId,
      actorId: body.generated_by,
      agentId: body.generated_by,
      eventType: "patch_proposed",
      policyDecision: policy.decision,
      reason: body.summary,
      metadata: { patch_id: patch.id, evidence_id: proof.id }
    });
  });
  return reply.code(201).send({
    proposal: store.patches[0],
    policy: { decision: store.patches[0].policyDecision, findings: store.patches[0].policyFindings },
    evidence: store.evidence[0]
  });
});

app.post("/v1/patches/:patchId/apply", async (request) => {
  const { patchId } = request.params as { patchId: string };
  const body = applyPatchSchema.parse(request.body);
  const store = await mutate((draft) => {
    const patch = draft.patches.find((item) => item.id === patchId);
    if (!patch) throw new Error("Patch proposal not found");
    patch.status = "ready_to_apply";
    patch.updatedAt = now();
    const mission = requireMission(draft, String(patch.missionId));
    audit(draft, {
      projectId: mission.projectId,
      missionId: mission.id,
      actorId: body.actor_id,
      agentId: `agent.${body.agent_role}`,
      eventType: "patch_apply_guarded",
      policyDecision: String(patch.policyDecision),
      reason: body.reason,
      metadata: { patch_id: patchId, role: body.role, local_mode: true }
    });
  });
  return {
    patch: store.patches.find((item) => item.id === patchId),
    note: "Patch marked ready for guarded application; local mode does not mutate files."
  };
});

app.get("/v1/ide/workspace", async () => ({
  root: config.projectRoot,
  mode: "local_desktop_ready",
  capabilities: {
    files: true,
    terminal: true,
    patchApply: true,
    persistence: "local_json",
    maxFileReadBytes: fileReadLimitBytes,
    terminalTimeoutMs
  },
  protectedPaths: protectedPathHints()
}));

app.get("/v1/ide/files", async (request) => {
  const query = ideFileQuerySchema.parse(request.query);
  const directory = resolveWorkspacePath(query.path || ".");
  const directoryStat = await stat(directory);
  if (!directoryStat.isDirectory()) {
    throw new Error("Requested path is not a directory.");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const rows = entries
    .filter((entry) => !isProtectedPath(path.join(query.path, entry.name)))
    .sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name))
    .slice(0, 300)
    .map((entry) => {
      const relativePath = normalizeWorkspacePath(path.join(query.path, entry.name));
      return {
        name: entry.name,
        path: relativePath,
        type: entry.isDirectory() ? "directory" : "file"
      };
    });
  return {
    root: config.projectRoot,
    path: normalizeWorkspacePath(query.path),
    entries: rows
  };
});

app.get("/v1/ide/file", async (request, reply) => {
  const query = ideFileQuerySchema.parse(request.query);
  if (!query.path) return reply.code(400).send({ error: "File path is required." });
  const filePath = resolveWorkspacePath(query.path);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) return reply.code(400).send({ error: "Requested path is not a file." });
  if (fileStat.size > fileReadLimitBytes) {
    return reply.code(413).send({ error: "File is too large for IDE preview.", limit_bytes: fileReadLimitBytes });
  }
  const content = await readFile(filePath, "utf8");
  return {
    path: normalizeWorkspacePath(query.path),
    bytes: fileStat.size,
    language: languageForPath(query.path),
    content
  };
});

app.put("/v1/ide/file", async (request, reply) => {
  const body = saveFileSchema.parse(request.body);
  const filePath = resolveWorkspacePath(body.path);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, body.content, "utf8");
  if (body.mission_id) {
    await mutate((draft) => {
      const mission = requireMission(draft, body.mission_id as string);
      const proof = createEvidence(mission, {
        type: "patch",
        title: `File saved: ${body.path}`,
        content: body.content,
        metadata: { path: body.path, source: "agentops_ide_file_save" },
        createdBy: body.actor_id
      });
      draft.evidence.unshift(proof);
      audit(draft, {
        projectId: mission.projectId,
        missionId: mission.id,
        actorId: body.actor_id,
        eventType: "ide_file_saved",
        policyDecision: "require_review",
        reason: `Saved ${body.path} from local IDE runtime.`,
        metadata: { path: body.path, evidence_id: proof.id, hash: proof.hash }
      });
    });
  }
  return reply.send({
    ok: true,
    path: normalizeWorkspacePath(body.path),
    bytes: Buffer.byteLength(body.content)
  });
});

app.post("/v1/ide/terminal/run", async (request, reply) => {
  const body = terminalRunSchema.parse(request.body);
  const cwd = resolveWorkspacePath(body.cwd || ".");
  const policy = evaluatePolicy({
    type: "command_execute",
    command: body.command,
    agent_role: "tester",
    autonomy_level: 4,
    risk_level: "medium"
  });
  if (policy.decision === "deny") {
    return reply.code(409).send({ policy });
  }
  const result = await runLocalCommand(body.command, cwd);
  if (body.mission_id) {
    await mutate((draft) => {
      const mission = requireMission(draft, body.mission_id as string);
      const job = createJob("tool.run_command", mission, { command: body.command, cwd: normalizeWorkspacePath(body.cwd) }, result.exitCode === 0 ? "succeeded" : "failed");
      job.output = result;
      draft.jobs.unshift(job);
      const proof = createEvidence(mission, {
        type: result.exitCode === 0 ? "command_output" : "test_result",
        title: `IDE terminal: ${body.command}`,
        content: `${result.stdout}\n${result.stderr}`.trim(),
        metadata: { command: body.command, cwd: body.cwd, exit_code: result.exitCode, job_id: job.id, policy },
        createdBy: body.actor_id
      });
      draft.evidence.unshift(proof);
      audit(draft, {
        projectId: mission.projectId,
        missionId: mission.id,
        actorId: body.actor_id,
        eventType: "ide_terminal_run",
        policyDecision: policy.decision,
        result: result.exitCode === 0 ? "succeeded" : "failed",
        reason: body.command,
        metadata: { job_id: job.id, evidence_id: proof.id }
      });
    });
  }
  return { policy, ...result };
});

app.post("/v1/ide/patch/apply", async (request, reply) => {
  const body = localPatchApplySchema.parse(request.body);
  if (!body.confirmed) {
    return reply.code(409).send({ error: "Patch application requires explicit confirmation." });
  }
  const result = await runLocalCommandWithInput("git apply --whitespace=nowarn", config.projectRoot, body.unified_diff);
  if (body.mission_id) {
    await mutate((draft) => {
      const mission = requireMission(draft, body.mission_id as string);
      const proof = createEvidence(mission, {
        type: "patch",
        title: "Local IDE patch apply",
        content: body.unified_diff,
        metadata: { exit_code: result.exitCode, stdout: result.stdout, stderr: result.stderr },
        createdBy: body.actor_id
      });
      draft.evidence.unshift(proof);
      audit(draft, {
        projectId: mission.projectId,
        missionId: mission.id,
        actorId: body.actor_id,
        eventType: "ide_patch_apply",
        policyDecision: "require_approval",
        result: result.exitCode === 0 ? "applied" : "failed",
        reason: "Local IDE patch application requested after explicit confirmation.",
        metadata: { evidence_id: proof.id, hash: proof.hash }
      });
    });
  }
  return { applied: result.exitCode === 0, ...result };
});

app.get("/v1/jobs", async (request) => {
  const { mission_id: missionId } = request.query as { mission_id?: string };
  const store = await loadStore();
  return missionId ? store.jobs.filter((job) => job.missionId === missionId) : store.jobs;
});

app.post("/v1/jobs", async (request, reply) => {
  const body = enqueueJobSchema.parse(request.body);
  const store = await mutate((draft) => {
    const mission = body.mission_id ? requireMission(draft, body.mission_id) : draft.missions[0];
    const job = createJob(body.type, mission, body.input, "queued");
    draft.jobs.unshift({ ...job, maxAttempts: body.max_attempts, idempotencyKey: body.idempotency_key ?? null });
    audit(draft, {
      projectId: body.project_id,
      missionId: body.mission_id ?? null,
      eventType: "job_enqueued",
      result: "queued",
      metadata: { job_id: job.id, job_type: body.type }
    });
  });
  return reply.code(202).send(store.jobs[0]);
});

app.get("/v1/tools", async () => [
  { id: "tool.npm-test", name: "npm run test", command: "npm run test", risk: "medium" },
  { id: "tool.npm-build", name: "npm run build", command: "npm run build", risk: "medium" },
  { id: "tool.policy-evaluate", name: "Policy evaluate", command: null, risk: "low" }
]);

app.get("/v1/model-providers", async () => [
  { id: "manual", kind: "manual", capabilities: ["human_in_loop", "deterministic"] },
  { id: "local", kind: "fake", capabilities: ["offline", "preview_safe"] }
]);

app.get("/v1/policies/evaluate", async (request) => {
  const query = request.query as Record<string, string | undefined>;
  return evaluatePolicy(
    policyActionSchema.parse({
      type: query.type ?? "file_read",
      path: query.path,
      command: query.command,
      agent_role: query.agent_role,
      autonomy_level: Number(query.autonomy_level ?? 2),
      risk_level: query.risk_level ?? "medium"
    })
  );
});

app.post("/v1/policies/evaluate", async (request) => evaluatePolicy(policyActionSchema.parse(request.body)));

app.get("/v1/audit", async (request) => {
  const { mission_id: missionId } = request.query as { mission_id?: string };
  const store = await loadStore();
  return missionId ? store.audit.filter((item) => item.missionId === missionId) : store.audit;
});

app.post("/v1/improvements/propose", async (request, reply) => {
  const body = improvementProposalSchema.parse(request.body);
  const store = await mutate((draft) => {
    const proposal = {
      id: prefixedId("impr"),
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
      createdAt: now(),
      appliedAt: null
    };
    draft.improvements.unshift(proposal);
    audit(draft, {
      eventType: "improvement_proposed",
      agentId: "agent.metadev",
      policyDecision: "require_approval",
      reason: body.rationale,
      metadata: { proposal_id: proposal.id }
    });
  });
  return reply.code(201).send(store.improvements[0]);
});

app.post("/v1/improvements/:id/approve", async (request) => {
  const { id } = request.params as { id: string };
  const body = approvalSchema.parse(request.body);
  const store = await mutate((draft) => {
    const proposal = draft.improvements.find((item) => item.id === id);
    if (!proposal) throw new Error("Improvement proposal not found");
    proposal.status = body.decision === "approved" ? "approved" : "rejected";
    audit(draft, {
      eventType: "improvement_approval",
      humanApprovalId: prefixedId("appr"),
      result: body.decision,
      reason: body.reason,
      metadata: { proposal_id: id }
    });
  });
  return store.improvements.find((item) => item.id === id);
});

app.post("/v1/improvements/:id/apply", async (request) => {
  const { id } = request.params as { id: string };
  const store = await mutate((draft) => {
    const proposal = draft.improvements.find((item) => item.id === id);
    if (!proposal) throw new Error("Improvement proposal not found");
    proposal.status = "ready_to_apply";
    proposal.appliedAt = null;
    audit(draft, {
      eventType: "improvement_apply_guarded",
      policyDecision: "require_approval",
      reason: "Local mode recorded guarded application intent.",
      metadata: { proposal_id: id }
    });
  });
  return store.improvements.find((item) => item.id === id);
});

let appPrepared = false;

export async function prepareLocalApp() {
  if (!appPrepared) {
    await ensureStore();
    appPrepared = true;
  }
  return app;
}

if (isLocalServerEntrypoint()) {
  await prepareLocalApp();
  await app.listen({ host: config.host, port: config.port });
}

async function mutate(mutator: (store: LocalStore) => void | Promise<void>) {
  const store = await loadStore();
  await mutator(store);
  await saveStore(store);
  return store;
}

async function ensureStore() {
  const store = await loadStore();
  await saveStore(store);
}

async function loadStore(): Promise<LocalStore> {
  if (useBlobStore()) {
    const blob = await agentopsBlobStore();
    const store = await blob.get(blobStoreKey, { consistency: "strong", type: "json" });
    return store ? normalizeStore(store as LocalStore) : seedStore();
  }

  try {
    return normalizeStore(JSON.parse(await readFile(storePath, "utf8")) as LocalStore);
  } catch {
    return seedStore();
  }
}

async function saveStore(store: LocalStore) {
  if (useBlobStore()) {
    const blob = await agentopsBlobStore();
    await blob.setJSON(blobStoreKey, store);
    return;
  }

  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function useBlobStore() {
  return process.env.AGENTOPS_STORAGE_ENGINE === "netlify_blobs";
}

async function agentopsBlobStore() {
  const { getStore } = await import("@netlify/blobs");
  return getStore(blobStoreName);
}

function isLocalServerEntrypoint() {
  const entrypoint = process.argv[1]?.replaceAll("\\", "/") ?? "";
  return entrypoint.endsWith("/localServer.ts") || entrypoint.endsWith("/localServer.js");
}

function seedStore(): LocalStore {
  const organization = {
    id: "org.default",
    name: "Default Organization",
    plan: "single_tenant",
    createdAt: now(),
    updatedAt: now()
  };
  const project = {
    id: "com.agentops.os",
    organizationId: organization.id,
    name: "AgentOps OS",
    type: "agentic_governance_platform",
    criticality: "high",
    owners: {
      product: "product-owner@example.com",
      technical: "technical-owner@example.com",
      security: "security-owner@example.com"
    },
    repos: [`local:${config.projectRoot}`],
    createdAt: now(),
    updatedAt: now()
  };
  const missions = [
    mission(project, "AOS-RUN-001", "Revenue analytics refactor", "Refactor the analytics surface, propose a safe patch, run sandbox checks, capture evidence and prepare approval.", "IN_PROGRESS", "medium", 4),
    mission(project, "AOS-RUN-002", "Auth security review", "Inspect authentication changes, detect risk, and require human approval before execution.", "WAITING_APPROVAL", "high", 3),
    mission(project, "AOS-RUN-003", "Database migration gate", "Validate migration scope, verify rollback evidence, and prepare release owner review.", "APPROVED", "medium", 2)
  ];
  const store: LocalStore = {
    organization,
    project,
    missions,
    agents: defaultAgents(organization.id),
    policies: defaultPolicies(),
    approvals: [],
    evidence: [],
    audit: [],
    memory: [
      {
        id: prefixedId("mem"),
        organizationId: organization.id,
        projectId: project.id,
        type: "stack",
        content: "React, TypeScript, Vite, Fastify, local JSON store, PostgreSQL production path, Rust core/CLI.",
        source: "local_seed",
        confidence: 0.95,
        createdAt: now()
      }
    ],
    evaluations: [],
    improvements: [],
    patches: [],
    jobs: [],
    users: [],
    sessions: []
  };

  const firstMission = store.missions[0];
  if (firstMission) {
    store.jobs.unshift(createJob("agent.run", firstMission, { role: "coder" }, "succeeded"));
    store.jobs.unshift(createJob("tool.run_command", firstMission, { command: "npm test" }, "succeeded"));
    store.evidence.unshift(
      createEvidence(firstMission, {
        type: "review",
        title: "Policy scan",
        content: "Initial local policy scan completed.",
        metadata: { seed: true },
        createdBy: "agent.security"
      }),
      createEvidence(firstMission, {
        type: "test_result",
        title: "Sandbox test result",
        content: "Initial local sandbox verification completed.",
        metadata: { seed: true },
        createdBy: "agent.tester"
      })
    );
    store.patches.unshift({
      id: "patch_001",
      missionId: firstMission.id,
      title: "Mission service hardening",
      summary: "Policy-gated patch proposal for the AgentOps mission workflow.",
      status: "waiting_approval",
      riskLevel: "medium",
      policyDecision: "require_review",
      policyFindings: ["Human approval is required before guarded application."],
      unifiedDiff: "diff --git a/apps/api/src/services/missionService.ts b/apps/api/src/services/missionService.ts",
      files: [{ path: "apps/api/src/services/missionService.ts", change_type: "modify" }],
      generatedBy: "agent.coder",
      agentRole: "coder",
      createdAt: now(),
      updatedAt: now(),
      appliedAt: null
    });
  }
  audit(store, {
    projectId: project.id,
    eventType: "local_store_seeded",
    reason: "Local persistent AgentOps store initialized."
  });
  return store;
}

function normalizeStore(store: LocalStore): LocalStore {
  return {
    ...store,
    users: store.users ?? [],
    sessions: store.sessions ?? []
  };
}

function overview(store: LocalStore) {
  return {
    organization: store.organization,
    project: store.project,
    missions: store.missions,
    agents: store.agents,
    policies: store.policies,
    approvals: store.approvals,
    evidence: store.evidence,
    audit: store.audit.slice(0, 30),
    memory: store.memory.slice(0, 20),
    evaluations: store.evaluations,
    improvements: store.improvements,
    patches: store.patches,
    jobs: store.jobs.slice(0, 30)
  };
}

function overviewProject(store: LocalStore) {
  return store.project;
}

function mission(project: Row, id: string, title: string, intent: string, status: string, riskLevel: string, autonomyLevel: number) {
  return {
    id,
    organizationId: project.organizationId,
    projectId: project.id,
    title,
    intent,
    status,
    riskLevel,
    autonomyLevel,
    context: { product_area: "platform", repository: "AgentOps" },
    scope: { include: ["apps/**", "packages/**", ".agentops/**"], exclude: [".env*", "secrets/**"] },
    constraints: { no_raw_secrets: true, require_human_approval: true },
    successCriteria: ["API health ok", "Cockpit web visible", "Policy engine active"],
    humanApproval: {
      before_execution: true,
      before_merge: true,
      before_policy_change: true
    },
    plan: null,
    createdAt: now(),
    updatedAt: now(),
    closedAt: null
  };
}

function defaultAgents(organizationId: unknown) {
  return [
    agent(organizationId, "planner", "Mission Planner", ["mission_structuring", "scope_control"]),
    agent(organizationId, "architect", "System Architect", ["impact_mapping", "risk_strategy"]),
    agent(organizationId, "coder", "Controlled Coder", ["scoped_write", "patch_generation"]),
    agent(organizationId, "tester", "Verification Tester", ["tests", "builds", "regression"]),
    agent(organizationId, "security", "Security Reviewer", ["secrets", "permissions", "supply_chain"]),
    agent(organizationId, "reviewer", "Human-aligned Reviewer", ["quality_review", "maintainability"]),
    agent(organizationId, "metadev", "MetaDev Supervisor", ["improvement_proposals", "replay_analysis"])
  ];
}

function defaultPolicies() {
  return [
    policy("deny_secrets_and_prod_paths", "deny", "critical"),
    policy("require_approval_for_auth_changes", "require_approval", "high"),
    policy("require_approval_for_database_changes", "require_approval", "high"),
    policy("require_sandbox_for_unlisted_command", "require_sandbox", "medium"),
    policy("require_approval_for_high_autonomy", "require_approval", "high")
  ];
}

function agent(organizationId: unknown, role: string, name: string, capabilities: string[]) {
  return {
    id: `agent.${role}`,
    organizationId,
    role,
    name,
    capabilities,
    model: "local-deterministic",
    tools: ["policy-evaluate"],
    permissions: { governed_by: ".agentops/policies" },
    status: "available",
    score: 0.82,
    createdAt: now()
  };
}

function policy(name: string, decision: string, severity: string) {
  return {
    id: `policy.${name}`,
    name,
    rule: { source: "local_agentops", deterministic: true },
    decision,
    severity,
    enabled: 1,
    createdAt: now()
  };
}

function createJob(type: string, mission: Row, input: Row, status: string): Row {
  return {
    id: prefixedId("job"),
    type,
    projectId: mission.projectId,
    missionId: mission.id,
    status,
    input,
    output:
      status === "succeeded"
        ? { summary: "Completed by local deterministic AgentOps runtime.", completed_at: now() }
        : {},
    attempts: status === "succeeded" ? 1 : 0,
    maxAttempts: 1,
    idempotencyKey: null,
    createdAt: now(),
    updatedAt: now(),
    startedAt: status === "succeeded" ? now() : null,
    finishedAt: status === "succeeded" ? now() : null
  };
}

function createEvidence(
  mission: Row,
  input: { type: string; title: string; content: string; metadata: Row; createdBy: string }
) {
  const createdAt = now();
  const hash = sha256({ missionId: mission.id, type: input.type, title: input.title, content: input.content, metadata: input.metadata, createdAt });
  return {
    id: prefixedId("ev"),
    missionId: mission.id,
    type: input.type,
    title: input.title,
    content: input.content,
    metadata: input.metadata,
    createdBy: input.createdBy,
    hash,
    createdAt
  };
}

function audit(store: LocalStore, event: Row) {
  store.audit.unshift({
    id: prefixedId("audit"),
    organizationId: store.organization.id,
    projectId: event.projectId ?? store.project.id,
    missionId: event.missionId ?? null,
    agentId: event.agentId ?? null,
    actorId: event.actorId ?? null,
    eventType: event.eventType,
    autonomyLevel: event.autonomyLevel ?? null,
    policyDecision: event.policyDecision ?? null,
    humanApprovalId: event.humanApprovalId ?? null,
    reason: event.reason ?? "",
    result: event.result ?? null,
    metadata: event.metadata ?? {},
    hash: sha256({ event, at: now() }),
    previousHash: store.audit[0]?.hash ?? null,
    createdAt: now()
  });
}

function findMission(store: LocalStore, missionId: string) {
  return store.missions.find((mission) => mission.id === missionId);
}

function requireMission(store: LocalStore, missionId: string) {
  const mission = findMission(store, missionId);
  if (!mission) throw new Error("Mission not found");
  return mission;
}

function resolveWorkspacePath(input: string) {
  const normalized = normalizeWorkspacePath(input || ".");
  if (isProtectedPath(normalized)) {
    throw new Error("Path is protected by the AgentOps local runtime.");
  }
  const absolute = path.resolve(config.projectRoot, normalized);
  const root = path.resolve(config.projectRoot);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes the AgentOps workspace.");
  }
  return absolute;
}

function normalizeWorkspacePath(input?: string) {
  return (input ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .filter((part) => part && part !== ".")
    .join("/");
}

function protectedPathHints() {
  return [".env*", "node_modules", "target", "dist", "apps/*/dist", ".agentops/local-store.json", ".agentops/sandboxes"];
}

function isProtectedPath(input: string) {
  const normalized = normalizeWorkspacePath(input);
  if (!normalized) return false;
  const segments = normalized.split("/");
  if (segments.includes("node_modules") || segments.includes("target") || segments.includes("dist")) return true;
  if (normalized === ".env" || normalized.startsWith(".env.")) return true;
  if (normalized === ".agentops/local-store.json" || normalized.startsWith(".agentops/sandboxes")) return true;
  if (normalized.includes("..")) return true;
  return false;
}

function languageForPath(input: string) {
  const ext = path.extname(input).toLowerCase();
  const file = path.basename(input).toLowerCase();
  if ([".ts", ".tsx"].includes(ext)) return "typescript";
  if ([".js", ".jsx", ".mjs", ".cjs"].includes(ext)) return "javascript";
  if (ext === ".rs") return "rust";
  if (ext === ".json") return "json";
  if (ext === ".css") return "css";
  if ([".md", ".mdx"].includes(ext)) return "markdown";
  if ([".yml", ".yaml"].includes(ext)) return "yaml";
  if (ext === ".sql") return "sql";
  if (file.includes("dockerfile")) return "dockerfile";
  return "text";
}

function runLocalCommand(command: string, cwd: string) {
  return runLocalCommandWithInput(command, cwd);
}

function runLocalCommandWithInput(command: string, cwd: string, input?: string) {
  return new Promise<{
    command: string;
    cwd: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    truncated: boolean;
  }>((resolve) => {
    const started = Date.now();
    const child = spawn("/bin/zsh", ["-lc", command], {
      cwd,
      env: {
        PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
        HOME: process.env.HOME ?? config.projectRoot,
        CI: "1",
        AGENTOPS_LOCAL_RUNTIME: "true"
      },
      stdio: ["pipe", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, terminalTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      stderr = appendLimited(stderr, error.message);
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        command,
        cwd: normalizeWorkspacePath(path.relative(config.projectRoot, cwd)),
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        truncated
      });
    });

    if (input) child.stdin.end(input);
    else child.stdin.end();

    function appendLimited(current: string, next: string) {
      const combined = current + next;
      if (Buffer.byteLength(combined) <= terminalOutputLimitBytes) return combined;
      truncated = true;
      return combined.slice(0, terminalOutputLimitBytes);
    }
  });
}

function prefixedId(prefix: string) {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function localPasswordHash(password: string) {
  return createHash("sha256").update(`agentops-local:${password}`).digest("hex");
}

async function createLocalSession(user: Row, store: LocalStore) {
  const token = `aos_local_${randomUUID().replace(/-/g, "")}`;
  const session = {
    id: prefixedId("ses"),
    token,
    userId: user.id,
    organizationId: user.organizationId,
    createdAt: now(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString()
  };
  store.sessions.unshift(session);
  await saveStore(store);
  return token;
}

async function localUserFromAuthorization(value: string | string[] | undefined) {
  const token = bearerToken(value);
  if (!token) return null;
  const store = await loadStore();
  const session = store.sessions.find((item) => item.token === token && String(item.expiresAt) > now());
  if (!session) return null;
  return store.users.find((user) => user.id === session.userId) ?? null;
}

function bearerToken(value: string | string[] | undefined) {
  const authorization = Array.isArray(value) ? value[0] : value;
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice("Bearer ".length).trim();
}

function publicUser(user: Row) {
  return {
    id: user.id,
    organization_id: user.organizationId,
    email: user.email,
    name: user.name,
    role: user.role,
    language: user.language
  };
}

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/(^\.|\.$)/g, "");
}

function now() {
  return new Date().toISOString();
}
