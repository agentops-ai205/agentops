import { describe, expect, it } from "vitest";
import {
  InvalidMissionTransitionError,
  assertTransition,
  canTransition
} from "../src/services/stateMachine.js";

describe("mission state machine", () => {
  it("allows canonical approval flow", () => {
    expect(canTransition("DRAFT", "PLANNED")).toBe(true);
    expect(canTransition("PLANNED", "WAITING_APPROVAL")).toBe(true);
    expect(canTransition("WAITING_APPROVAL", "APPROVED")).toBe(true);
  });

  it("rejects skipping evidence-producing states", () => {
    expect(canTransition("DRAFT", "CLOSED")).toBe(false);
  });

  it("allows test failure and human review close paths", () => {
    expect(canTransition("IN_PROGRESS", "TESTING")).toBe(true);
    expect(canTransition("TESTING", "FAILED_TESTS")).toBe(true);
    expect(canTransition("TESTING", "HUMAN_REVIEW")).toBe(true);
    expect(canTransition("HUMAN_REVIEW", "CLOSED")).toBe(true);
  });

  it("throws a typed transition error", () => {
    expect(() => assertTransition("APPROVED", "CLOSED")).toThrow(
      InvalidMissionTransitionError
    );
  });
});
