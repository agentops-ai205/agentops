import { describe, expect, it } from "vitest";
import {
  isTerminalJobStatus,
  serializeJobError,
  shouldRetryJob,
  statusAfterJobFailure
} from "../src/services/jobRules.js";

describe("job rules", () => {
  it("identifies terminal statuses", () => {
    expect(isTerminalJobStatus("succeeded")).toBe(true);
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
    expect(isTerminalJobStatus("queued")).toBe(false);
  });

  it("retries until max attempts is reached", () => {
    expect(shouldRetryJob(1, 3)).toBe(true);
    expect(shouldRetryJob(3, 3)).toBe(false);
    expect(statusAfterJobFailure(1, 3)).toBe("queued");
    expect(statusAfterJobFailure(3, 3)).toBe("failed");
  });

  it("serializes unknown errors", () => {
    expect(serializeJobError(new Error("boom"))).toBe("boom");
    expect(serializeJobError("plain")).toBe("plain");
  });
});
