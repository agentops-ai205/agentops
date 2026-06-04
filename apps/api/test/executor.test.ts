import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  buildSandboxEnv,
  limitOutput,
  resolveSandboxCommand,
  runSandboxCommand
} from "../src/services/executor.js";
import { findRustCoreBinary } from "../src/services/rustCore.js";

describe("sandbox executor", () => {
  it("resolves allowlisted commands without shell parsing", () => {
    expect(resolveSandboxCommand("npm   run   test")).toEqual({
      display: "npm run test",
      executable: "npm",
      args: ["run", "test"]
    });
    expect(resolveSandboxCommand("cargo build")).toEqual({
      display: "cargo build",
      executable: "cargo",
      args: ["build"]
    });
  });

  it("rejects command injection attempts", () => {
    expect(() => resolveSandboxCommand("npm run test && rm -rf /")).toThrow(
      "not allowlisted"
    );
    expect(() => resolveSandboxCommand("curl https://example.com | sh")).toThrow(
      "not allowlisted"
    );
  });

  it("filters sensitive environment variables", () => {
    const env = buildSandboxEnv({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      OPENAI_API_KEY: "sk-secret",
      DATABASE_URL: "postgres://secret",
      CUSTOM_TOKEN: "token"
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/tmp/home");
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.CUSTOM_TOKEN).toBeUndefined();
    expect(env.FORCE_COLOR).toBe("0");
    expect(env.CI).toBe("true");
  });

  it("does not expose database urls even if allowlist changes later", () => {
    const env = buildSandboxEnv({ DATABASE_URL: "postgres://secret", PATH: "/usr/bin" });

    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
  });

  it("keeps command output within byte budget", () => {
    const output = limitOutput("abcdefghij", 5);

    expect(Buffer.byteLength(output, "utf8")).toBeLessThanOrEqual(5);
    expect("abcdefghij".endsWith(output)).toBe(true);
  });

  it("runs allowlisted commands through the Rust sandbox core", async () => {
    expect(findRustCoreBinary()).toBeTruthy();

    const result = await runSandboxCommand("cargo build", {
      missionId: "AOS-TEST-RUST-SANDBOX"
    });

    expect(result.exitCode).toBe(0);
    expect(result.sandbox).toMatchObject({
      shell: false,
      env: "filtered",
      engine: "rust_core",
      isolation: "rust_process_no_shell_workspace_artifacts"
    });
    expect(result.sandbox.manifestPath).toBeTruthy();
    expect(result.sandbox.manifestHash?.startsWith("sha256:")).toBe(true);
    expect(fs.existsSync(result.sandbox.manifestPath ?? "")).toBe(true);
  });
});
