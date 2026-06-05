import path from "node:path";

export interface AgentOpsConfig {
  appEnv: string;
  databaseUrl: string;
  host: string;
  port: number;
  httpBodyLimitBytes: number;
  httpAllowedOrigins: string[];
  operatorToken?: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  projectRoot: string;
  sandboxRoot: string;
  commandTimeoutMs: number;
  sandboxOutputLimitBytes: number;
  sandboxEngine: string;
  policyEngine: string;
  rustCoreCliPath?: string;
  rustPolicyTimeoutMs: number;
  defaultModelProvider: string;
  modelMaxTokens: number;
  modelTimeoutMs: number;
  defaultOrganizationId: string;
}

export const config = buildConfig(process.env);

export function buildConfig(env: NodeJS.ProcessEnv): AgentOpsConfig {
  const projectRoot =
    env.AGENTOPS_PROJECT_ROOT ??
    path.resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : ".");

  const resolved: AgentOpsConfig = {
    appEnv: env.NODE_ENV ?? "development",
    databaseUrl: env.DATABASE_URL ?? "postgres://agentops:agentops@127.0.0.1:5432/agentops",
    host: env.API_HOST ?? "127.0.0.1",
    port: numberFromEnv(env.API_PORT, 3000, "API_PORT"),
    httpBodyLimitBytes: numberFromEnv(
      env.AGENTOPS_HTTP_BODY_LIMIT_BYTES,
      1_000_000,
      "AGENTOPS_HTTP_BODY_LIMIT_BYTES"
    ),
    httpAllowedOrigins: parseCsv(env.AGENTOPS_ALLOWED_ORIGINS),
    operatorToken: env.AGENTOPS_OPERATOR_TOKEN,
    rateLimitWindowMs: numberFromEnv(
      env.AGENTOPS_RATE_LIMIT_WINDOW_MS,
      60_000,
      "AGENTOPS_RATE_LIMIT_WINDOW_MS"
    ),
    rateLimitMax: numberFromEnv(env.AGENTOPS_RATE_LIMIT_MAX, 600, "AGENTOPS_RATE_LIMIT_MAX"),
    projectRoot,
    sandboxRoot: env.AGENTOPS_SANDBOX_ROOT ?? path.join(projectRoot, ".agentops/sandboxes"),
    commandTimeoutMs: numberFromEnv(
      env.AGENTOPS_COMMAND_TIMEOUT_MS,
      120_000,
      "AGENTOPS_COMMAND_TIMEOUT_MS"
    ),
    sandboxOutputLimitBytes: numberFromEnv(
      env.AGENTOPS_SANDBOX_OUTPUT_LIMIT_BYTES,
      20_000,
      "AGENTOPS_SANDBOX_OUTPUT_LIMIT_BYTES"
    ),
    sandboxEngine: env.AGENTOPS_SANDBOX_ENGINE ?? "rust_core",
    policyEngine: env.AGENTOPS_POLICY_ENGINE ?? "rust_core",
    rustCoreCliPath: env.AGENTOPS_CORE_CLI_PATH,
    rustPolicyTimeoutMs: numberFromEnv(
      env.AGENTOPS_RUST_POLICY_TIMEOUT_MS,
      5_000,
      "AGENTOPS_RUST_POLICY_TIMEOUT_MS"
    ),
    defaultModelProvider: env.AGENTOPS_MODEL_PROVIDER ?? "manual",
    modelMaxTokens: numberFromEnv(env.AGENTOPS_MODEL_MAX_TOKENS, 4_000, "AGENTOPS_MODEL_MAX_TOKENS"),
    modelTimeoutMs: numberFromEnv(env.AGENTOPS_MODEL_TIMEOUT_MS, 30_000, "AGENTOPS_MODEL_TIMEOUT_MS"),
    defaultOrganizationId: env.AGENTOPS_DEFAULT_ORGANIZATION_ID ?? "org.default"
  };

  validateConfig(resolved);
  return resolved;
}

function parseCsv(input?: string) {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberFromEnv(input: string | undefined, fallback: number, name: string) {
  const value = Number(input ?? fallback);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return value;
}

function validateConfig(resolved: AgentOpsConfig) {
  if (resolved.appEnv !== "production") return;

  const missing = [];
  if (!resolved.operatorToken) missing.push("AGENTOPS_OPERATOR_TOKEN");
  if (resolved.httpAllowedOrigins.length === 0) missing.push("AGENTOPS_ALLOWED_ORIGINS");

  if (missing.length > 0) {
    throw new Error(`Production configuration is missing: ${missing.join(", ")}.`);
  }
}
