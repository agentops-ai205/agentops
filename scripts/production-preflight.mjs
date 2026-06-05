import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith("--")) {
    const [key, value] = arg.split("=");
    args.set(key, value ?? process.argv[index + 1] ?? true);
    if (!arg.includes("=")) index += 1;
  }
}

const envPath = path.resolve(args.get("--env") || "deploy/production.env");
const allowPlaceholders = Boolean(args.get("--allow-placeholders"));
const root = process.cwd();
const requiredFiles = [
  "Dockerfile.api",
  "Dockerfile.web",
  "netlify.toml",
  "deploy/docker-compose.production.yml",
  "apps/api/migrations/0001_agentops.sql",
  "apps/api/migrations/0002_supabase_ready_tenancy.sql"
];

const checks = [];

for (const file of requiredFiles) {
  checks.push({
    ok: existsSync(path.join(root, file)),
    name: `file:${file}`,
    message: existsSync(path.join(root, file)) ? "present" : "missing"
  });
}

if (!existsSync(envPath)) {
  checks.push({
    ok: false,
    name: "env:file",
    message: `${path.relative(root, envPath)} does not exist`
  });
  report(checks);
}

const env = parseEnv(readFileSync(envPath, "utf8"));
const requiredEnv = [
  "NODE_ENV",
  "DATABASE_URL",
  "AGENTOPS_OPERATOR_TOKEN",
  "AGENTOPS_ALLOWED_ORIGINS",
  "AGENTOPS_CORE_CLI_PATH",
  "AGENTOPS_POLICY_ENGINE",
  "AGENTOPS_SANDBOX_ENGINE",
  "VITE_API_URL"
];

for (const key of requiredEnv) {
  checks.push({
    ok: Boolean(env[key]),
    name: `env:${key}`,
    message: env[key] ? "set" : "missing"
  });
}

checks.push({
  ok: env.NODE_ENV === "production",
  name: "env:NODE_ENV",
  message: mask(env.NODE_ENV)
});

checks.push({
  ok: allowPlaceholders || !/USER:PASSWORD@HOST|replace-with/i.test(env.DATABASE_URL ?? ""),
  name: "env:DATABASE_URL",
  message: allowPlaceholders ? "template accepted" : mask(env.DATABASE_URL)
});

checks.push({
  ok: allowPlaceholders || (env.AGENTOPS_OPERATOR_TOKEN ?? "").length >= 32,
  name: "env:AGENTOPS_OPERATOR_TOKEN",
  message: allowPlaceholders ? "template accepted" : "masked"
});

const origins = splitCsv(env.AGENTOPS_ALLOWED_ORIGINS);
checks.push({
  ok: origins.includes("https://agentops.ai") && origins.includes("https://www.agentops.ai"),
  name: "env:AGENTOPS_ALLOWED_ORIGINS",
  message: origins.join(",")
});

checks.push({
  ok: ["https://api.agentops.ai", "https://agentops-ai205.netlify.app/api"].includes(
    env.VITE_API_URL ?? ""
  ),
  name: "env:VITE_API_URL",
  message: mask(env.VITE_API_URL)
});

checks.push({
  ok: env.AGENTOPS_CORE_CLI_PATH === "/app/bin/agentops",
  name: "env:AGENTOPS_CORE_CLI_PATH",
  message: mask(env.AGENTOPS_CORE_CLI_PATH)
});

checks.push({
  ok: env.AGENTOPS_POLICY_ENGINE === "rust_core_strict",
  name: "env:AGENTOPS_POLICY_ENGINE",
  message: mask(env.AGENTOPS_POLICY_ENGINE)
});

checks.push({
  ok: env.AGENTOPS_SANDBOX_ENGINE === "rust_core",
  name: "env:AGENTOPS_SANDBOX_ENGINE",
  message: mask(env.AGENTOPS_SANDBOX_ENGINE)
});

report(checks);

function parseEnv(input) {
  return input.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return acc;
    const index = trimmed.indexOf("=");
    if (index === -1) return acc;
    acc[trimmed.slice(0, index)] = trimmed.slice(index + 1);
    return acc;
  }, {});
}

function splitCsv(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mask(value = "") {
  if (!value) return "missing";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function report(items) {
  const failed = items.filter((item) => !item.ok);
  for (const item of items) {
    const marker = item.ok ? "OK" : "FAIL";
    console.log(`${marker} ${item.name} ${item.message}`);
  }
  if (failed.length > 0) {
    console.error(`Production preflight failed: ${failed.length} issue(s).`);
    process.exit(1);
  }
  console.log("Production preflight passed.");
}
