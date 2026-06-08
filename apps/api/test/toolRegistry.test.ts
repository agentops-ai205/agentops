import { describe, expect, it } from "vitest";
import { ApiError } from "../src/http/errors.js";
import { assertToolRole, getToolDescriptor } from "../src/services/toolRegistry.js";

describe("tool registry", () => {
  it("exposes patch-first tools", () => {
    expect(getToolDescriptor("propose_patch")?.requiresApproval).toBe(false);
    expect(getToolDescriptor("apply_patch")?.requiresApproval).toBe(true);
  });

  it("allows coder to propose patches", () => {
    expect(assertToolRole("propose_patch", "coder").name).toBe("propose_patch");
  });

  it("blocks unauthorized roles", () => {
    expect(() => assertToolRole("apply_patch", "planner")).toThrow(ApiError);
  });
});
