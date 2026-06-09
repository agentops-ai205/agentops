import { describe, expect, it } from "vitest";
import { isRustCoreRequired } from "../src/services/readiness.js";

describe("readiness requirements", () => {
  it("requires Rust when either production engine is Rust backed", () => {
    expect(isRustCoreRequired("rust_core_strict", "typescript")).toBe(true);
    expect(isRustCoreRequired("typescript", "rust_core")).toBe(true);
  });

  it("allows Netlify Functions to report healthy with TypeScript engines", () => {
    expect(isRustCoreRequired("typescript", "typescript")).toBe(false);
  });
});
