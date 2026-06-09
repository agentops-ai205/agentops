import { argValue } from "./env-utils.mjs";

const args = process.argv.slice(2);
const apiUrl = stripTrailingSlash(
  argValue(args, "--api", process.env.AGENTOPS_API_URL || "https://capable-cat-f6133c.netlify.app/api")
);
const webUrl = stripTrailingSlash(
  argValue(args, "--web", process.env.AGENTOPS_WEB_URL || "https://capable-cat-f6133c.netlify.app")
);
const operatorToken = process.env.AGENTOPS_OPERATOR_TOKEN;
const requireRustCore = args.includes("--require-rust-core") || process.env.AGENTOPS_REQUIRE_RUST_CORE === "true";

const checks = [];

await check("web:index", webUrl, { attempts: 3 });
await check("api:live", `${apiUrl}/live`, { attempts: 3 });
const health = await check("api:health", `${apiUrl}/health`, { attempts: 5, delayMs: 2_000 });
const ready = await check("api:ready", `${apiUrl}/ready`, {
  attempts: 3,
  delayMs: 2_000,
  expected: [200, 503],
  required: requireRustCore
});
await check("api:overview", `${apiUrl}/v1/overview`, {
  attempts: 3,
  headers: operatorToken ? { authorization: `Bearer ${operatorToken}` } : {},
  expected: operatorToken ? [200] : [200, 401]
});

if (requireRustCore) {
  const rustCoreReady = health.json?.checks?.rust_core === true || ready.json?.checks?.rust_core === true;
  checks.push({
    ok: rustCoreReady,
    name: "api:rust_core",
    status: rustCoreReady ? "ready" : "missing",
    url: `${apiUrl}/health`
  });
}

for (const item of checks) {
  const marker = item.ok ? "OK" : item.required === false ? "WARN" : "FAIL";
  console.log(`${marker} ${item.name} ${item.status} ${item.url}`);
}

const failed = checks.filter((item) => item.required !== false && !item.ok);
if (failed.length > 0) {
  console.error(`Production smoke failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("Production smoke passed.");

async function check(name, url, options = {}) {
  const expected = options.expected ?? [200];
  const attempts = options.attempts ?? 1;
  const delayMs = options.delayMs ?? 1_000;
  let item;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    item = await attemptCheck(name, url, expected, options);
    if (item.ok || attempt === attempts) break;
    await delay(delayMs);
  }

  checks.push(item);
  return item;
}

async function attemptCheck(name, url, expected, options = {}) {
  try {
    const response = await fetch(url, {
      headers: options.headers ?? {}
    });
    const body = await response.text();
    return {
      ok: expected.includes(response.status),
      name,
      status: response.status,
      url,
      json: parseJson(body),
      required: options.required
    };
  } catch (error) {
    return {
      ok: false,
      name,
      status: error instanceof Error ? error.message : "network_error",
      url,
      required: options.required
    };
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
