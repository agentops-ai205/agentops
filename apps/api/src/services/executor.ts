import { spawn } from "node:child_process";
import { config } from "../config.js";
import { writeSandboxManifest } from "./sandboxWorkspace.js";
import { buildRustCoreEnv, findRustCoreBinary } from "./rustCore.js";

export interface SandboxCommandSpec {
  display: string;
  executable: string;
  args: string[];
}

export interface SandboxResult {
  command: string;
  exitCode: number | null;
  signal: NodeJS.Signals | string | null;
  output: string;
  timedOut: boolean;
  sandbox: {
    shell: false;
    executionCwd: string;
    workspaceRoot: string | null;
    artifactsDir: string | null;
    manifestPath: string | null;
    manifestHash: string | null;
    env: "filtered";
    network: "not_enforced";
    outputLimitBytes: number;
    timeoutMs: number;
    isolation: "process_no_shell_workspace_artifacts" | "rust_process_no_shell_workspace_artifacts";
    engine?: "rust_core" | "typescript_fallback";
    kernelVersion?: string;
    fallbackReason?: string;
  };
}

export interface SandboxRunOptions {
  missionId?: string;
}

const allowedCommands: Record<string, SandboxCommandSpec> = {
  "npm run test": { display: "npm run test", executable: "npm", args: ["run", "test"] },
  "npm run build": { display: "npm run build", executable: "npm", args: ["run", "build"] },
  "npm run typecheck": {
    display: "npm run typecheck",
    executable: "npm",
    args: ["run", "typecheck"]
  },
  "cargo test": { display: "cargo test", executable: "cargo", args: ["test"] },
  "cargo build": { display: "cargo build", executable: "cargo", args: ["build"] }
};

const allowedEnvKeys = new Set([
  "PATH",
  "HOME",
  "TMPDIR",
  "TMP",
  "TEMP",
  "NODE_ENV",
  "CI",
  "CARGO_HOME",
  "RUSTUP_HOME"
]);
const secretEnvPattern = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY|CREDENTIAL|DATABASE_URL)/i;

export function resolveSandboxCommand(command: string) {
  const normalized = command.trim().replace(/\s+/g, " ");
  const spec = allowedCommands[normalized];
  if (!spec) {
    throw new Error(`Command is not allowlisted for AgentOps sandbox executor: ${normalized}`);
  }
  return spec;
}

export function buildSandboxEnv(source: NodeJS.ProcessEnv = process.env) {
  const env: Record<string, string> = {};
  for (const key of allowedEnvKeys) {
    const value = source[key];
    if (value && !secretEnvPattern.test(key)) env[key] = value;
  }
  env.FORCE_COLOR = "0";
  env.CI = env.CI ?? "true";
  return env;
}

export function limitOutput(input: string, maxBytes: number) {
  if (Buffer.byteLength(input, "utf8") <= maxBytes) return input;
  let output = input;
  while (Buffer.byteLength(output, "utf8") > maxBytes) {
    output = output.slice(Math.ceil(output.length * 0.1));
  }
  return output;
}

export async function runSandboxCommand(command: string, options: SandboxRunOptions = {}) {
  if (config.sandboxEngine !== "typescript") {
    const rustResult = await runSandboxCommandWithRust(command, options);
    if (rustResult.result) return rustResult.result;

    if (config.sandboxEngine === "rust_core_strict") {
      throw new Error(`Rust sandbox core unavailable: ${rustResult.error}`);
    }
  }

  return runSandboxCommandFallback(command, options);
}

async function runSandboxCommandWithRust(
  command: string,
  options: SandboxRunOptions
): Promise<{ result?: SandboxResult; error?: string }> {
  const binary = findRustCoreBinary();
  if (!binary) return { error: "agentops Rust CLI binary not found" };

  const args = [
    "sandbox-run",
    "--command",
    command,
    "--project-root",
    config.projectRoot,
    "--sandbox-root",
    config.sandboxRoot,
    "--timeout-ms",
    String(config.commandTimeoutMs),
    "--output-limit-bytes",
    String(config.sandboxOutputLimitBytes)
  ];
  if (options.missionId) args.push("--mission-id", options.missionId);

  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      cwd: config.projectRoot,
      shell: false,
      env: buildRustCoreEnv()
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = limitOutput(stdout + chunk.toString(), config.sandboxOutputLimitBytes * 2);
    });
    child.stderr.on("data", (chunk) => {
      stderr = limitOutput(stderr + chunk.toString(), config.sandboxOutputLimitBytes);
    });
    child.on("error", (error) => {
      resolve({ error: error.message });
    });
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        resolve({ error: stderr.trim() || stdout.trim() || `Rust sandbox core exited ${exitCode}` });
        return;
      }

      try {
        resolve({ result: parseRustSandboxResult(stdout) });
      } catch (error) {
        resolve({
          error: error instanceof Error ? error.message : "Rust sandbox core returned invalid JSON"
        });
      }
    });
  });
}

function parseRustSandboxResult(stdout: string): SandboxResult {
  const parsed = JSON.parse(stdout) as SandboxResult;
  if (!parsed.command || typeof parsed.output !== "string" || !parsed.sandbox) {
    throw new Error("Rust sandbox result is missing command, output, or sandbox metadata");
  }
  return parsed;
}

async function runSandboxCommandFallback(command: string, options: SandboxRunOptions = {}) {
  const spec = resolveSandboxCommand(command);
  const outputLimitBytes = config.sandboxOutputLimitBytes;
  let timedOut = false;
  const startedAt = new Date();

  return new Promise<SandboxResult>((resolve, reject) => {
    const child = spawn(spec.executable, spec.args, {
      cwd: config.projectRoot,
      shell: false,
      timeout: config.commandTimeoutMs,
      env: buildSandboxEnv()
    });

    let output = "";
    child.stdout.on("data", (chunk) => {
      output = limitOutput(output + chunk.toString(), outputLimitBytes);
    });
    child.stderr.on("data", (chunk) => {
      output = limitOutput(output + chunk.toString(), outputLimitBytes);
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("spawn", () => {
      if (config.commandTimeoutMs > 0) {
        setTimeout(() => {
          timedOut = child.exitCode === null && !child.killed;
        }, config.commandTimeoutMs);
      }
    });
    child.on("close", (exitCode, signal) => {
      const finishedAt = new Date();
      const baseSandbox = {
        shell: false as const,
        executionCwd: config.projectRoot,
        workspaceRoot: null as string | null,
        artifactsDir: null as string | null,
        manifestPath: null as string | null,
        manifestHash: null as string | null,
        env: "filtered" as const,
        network: "not_enforced" as const,
        outputLimitBytes,
        timeoutMs: config.commandTimeoutMs,
        isolation: "process_no_shell_workspace_artifacts" as const,
        engine: "typescript_fallback" as const,
        fallbackReason:
          config.sandboxEngine === "typescript" ? "typescript engine explicitly selected" : undefined
      };
      const baseResult = {
        command: spec.display,
        exitCode,
        signal,
        output,
        timedOut,
        sandbox: baseSandbox
      };

      if (!options.missionId) {
        resolve(baseResult);
        return;
      }

      writeSandboxManifest({
        missionId: options.missionId,
        command: spec.display,
        exitCode,
        signal,
        timedOut,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        executionCwd: config.projectRoot,
        sandbox: baseSandbox
      })
        .then((manifestResult) => {
          resolve({
            ...baseResult,
            sandbox: {
              ...baseSandbox,
              workspaceRoot: manifestResult.workspace.root,
              artifactsDir: manifestResult.workspace.artifactsDir,
              manifestPath: manifestResult.manifestPath,
              manifestHash: manifestResult.manifestHash
            }
          });
        })
        .catch(reject);
    });
  });
}
