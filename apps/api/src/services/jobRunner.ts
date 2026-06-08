import type { JobRow } from "./jobService.js";
import { runAgentJob } from "./agentJobHandlers.js";
import {
  claimNextQueuedJob,
  markJobFailed,
  markJobSucceeded
} from "./jobService.js";
import { runEvaluationJob, runMissionCommandJob } from "./missionJobHandlers.js";

export async function runJob(job: JobRow) {
  if (job.type === "tool.run_command") {
    if (!job.missionId) throw new Error("Command job requires mission_id.");
    return runMissionCommandJob(job.missionId, job.input as Record<string, unknown>);
  }

  if (job.type === "evaluation.run") {
    if (!job.missionId) throw new Error("Evaluation job requires mission_id.");
    return runEvaluationJob(job.missionId);
  }

  if (job.type === "patch.apply_guarded") {
    return {
      status: "ready",
      note: "Patch application jobs are guarded until sandbox patch application is implemented."
    };
  }

  if (job.type === "agent.run") {
    if (!job.missionId) throw new Error("Agent job requires mission_id.");
    return runAgentJob(job.missionId, job.input as Record<string, unknown>);
  }

  throw new Error(`Unsupported job type: ${job.type}`);
}

export async function runNextJob() {
  const job = await claimNextQueuedJob();
  if (!job) return null;

  try {
    const result = await runJob(job);
    return markJobSucceeded(job, result as Record<string, unknown>);
  } catch (error) {
    return markJobFailed(job, error);
  }
}

export async function runPendingJobs(limit: number) {
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await runNextJob();
    if (!result) break;
    results.push(result);
  }
  return results;
}
