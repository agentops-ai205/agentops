import path from "node:path";

export const config = {
  appEnv: process.env.NODE_ENV ?? "development",
  databaseUrl:
    process.env.DATABASE_URL ??
    "postgres://agentops:agentops@127.0.0.1:5432/agentops",
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 3000),
  httpBodyLimitBytes: Number(process.env.AGENTOPS_HTTP_BODY_LIMIT_BYTES ?? 1_000_000),
  httpAllowedOrigins: parseCsv(process.env.AGENTOPS_ALLOWED_ORIGINS),
  operatorToken: process.env.AGENTOPS_OPERATOR_TOKEN,
  rateLimitWindowMs: Number(process.env.AGENTOPS_RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.AGENTOPS_RATE_LIMIT_MAX ?? 600),
  projectRoot:
    process.env.AGENTOPS_PROJECT_ROOT ??
    path.resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : "."),
  sandboxRoot:
    process.env.AGENTOPS_SANDBOX_ROOT ??
    path.join(
      process.env.AGENTOPS_PROJECT_ROOT ??
        path.resolve(process.cwd(), process.cwd().endsWith("apps/api") ? "../.." : "."),
      ".agentops/sandboxes"
    ),
  commandTimeoutMs: Number(process.env.AGENTOPS_COMMAND_TIMEOUT_MS ?? 120_000),
  sandboxOutputLimitBytes: Number(process.env.AGENTOPS_SANDBOX_OUTPUT_LIMIT_BYTES ?? 20_000),
  sandboxEngine: process.env.AGENTOPS_SANDBOX_ENGINE ?? "rust_core",
  policyEngine: process.env.AGENTOPS_POLICY_ENGINE ?? "rust_core",
  rustCoreCliPath: process.env.AGENTOPS_CORE_CLI_PATH,
  rustPolicyTimeoutMs: Number(process.env.AGENTOPS_RUST_POLICY_TIMEOUT_MS ?? 5_000),
  defaultModelProvider: process.env.AGENTOPS_MODEL_PROVIDER ?? "manual",
  modelMaxTokens: Number(process.env.AGENTOPS_MODEL_MAX_TOKENS ?? 4_000),
  modelTimeoutMs: Number(process.env.AGENTOPS_MODEL_TIMEOUT_MS ?? 30_000),
  defaultOrganizationId: process.env.AGENTOPS_DEFAULT_ORGANIZATION_ID ?? "org.default"
};

function parseCsv(input?: string) {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
