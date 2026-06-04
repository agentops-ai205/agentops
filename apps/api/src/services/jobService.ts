import type { EnqueueJobInput, JobType } from "@agentops/shared";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { jobs, projects } from "../db/schema.js";
import { config } from "../config.js";
import { notFound } from "../http/errors.js";
import { id } from "./ids.js";
import { serializeJobError, statusAfterJobFailure } from "./jobRules.js";

export type JobRow = typeof jobs.$inferSelect;

export async function enqueueJob(input: EnqueueJobInput) {
  const organizationId = await getProjectOrganizationId(input.project_id);
  if (input.idempotency_key) {
    const [existing] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.idempotencyKey, input.idempotency_key))
      .limit(1);
    if (existing) return existing;
  }

  const [job] = await db
    .insert(jobs)
    .values({
      id: id("job"),
      organizationId,
      type: input.type,
      projectId: input.project_id,
      missionId: input.mission_id ?? null,
      status: "queued",
      input: input.input,
      result: null,
      attempts: 0,
      maxAttempts: input.max_attempts,
      idempotencyKey: input.idempotency_key ?? null,
      lastError: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null
    })
    .returning();
  return job;
}

async function getProjectOrganizationId(projectId: string) {
  const [project] = await db
    .select({ organizationId: projects.organizationId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project?.organizationId ?? config.defaultOrganizationId;
}

export async function listJobs(missionId?: string) {
  if (missionId) {
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.missionId, missionId))
      .orderBy(desc(jobs.createdAt));
  }
  return db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);
}

export async function getJobOrThrow(jobId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw notFound("JOB_NOT_FOUND", "Job not found.", { job_id: jobId });
  return job;
}

export async function claimNextQueuedJob(type?: JobType) {
  const queued = type
    ? await db
        .select()
        .from(jobs)
        .where(eq(jobs.type, type))
        .orderBy(jobs.createdAt)
        .limit(1)
    : await db.select().from(jobs).where(eq(jobs.status, "queued")).orderBy(jobs.createdAt).limit(1);

  const job = queued.find((item) => item.status === "queued");
  if (!job) return null;

  const [claimed] = await db
    .update(jobs)
    .set({
      status: "running",
      attempts: job.attempts + 1,
      startedAt: new Date(),
      lastError: null
    })
    .where(eq(jobs.id, job.id))
    .returning();
  return claimed ?? null;
}

export async function markJobSucceeded(job: JobRow, result: Record<string, unknown>) {
  const [updated] = await db
    .update(jobs)
    .set({
      status: "succeeded",
      result,
      finishedAt: new Date(),
      lastError: null
    })
    .where(eq(jobs.id, job.id))
    .returning();
  return updated ?? job;
}

export async function markJobFailed(job: JobRow, error: unknown) {
  const attempts = job.attempts;
  const status = statusAfterJobFailure(attempts, job.maxAttempts);
  const [updated] = await db
    .update(jobs)
    .set({
      status,
      lastError: serializeJobError(error),
      finishedAt: status === "queued" ? null : new Date()
    })
    .where(eq(jobs.id, job.id))
    .returning();
  return updated ?? job;
}
