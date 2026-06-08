import type { JobStatus } from "@agentops/shared";

export function isTerminalJobStatus(status: JobStatus) {
  return ["succeeded", "failed", "cancelled", "dead"].includes(status);
}

export function shouldRetryJob(attempts: number, maxAttempts: number) {
  return attempts < maxAttempts;
}

export function statusAfterJobFailure(attempts: number, maxAttempts: number): JobStatus {
  return shouldRetryJob(attempts, maxAttempts) ? "queued" : "failed";
}

export function serializeJobError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
