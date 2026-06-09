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

await check("web:index", webUrl);
await check("api:live", `${apiUrl}/live`);
const ready = await check("api:ready", `${apiUrl}/ready`, { expected: [200, 503] });
await check("api:overview", `${apiUrl}/v1/overview`, {
  headers: operatorToken ? { authorization: `Bearer ${operatorToken}` } : {},
  expected: operatorToken ? [200] : [200, 401]
});

if (requireRustCore) {
  checks.push({
    ok: ready.status === 200 && ready.json?.checks?.rust_core === true,
    name: "api:rust_core",
    status: ready.json?.checks?.rust_core === true ? "ready" : "missing",
    url: `${apiUrl}/ready`
  });
}

for (const item of checks) {
  console.log(`${item.ok ? "OK" : "FAIL"} ${item.name} ${item.status} ${item.url}`);
}

const failed = checks.filter((item) => !item.ok);
if (failed.length > 0) {
  console.error(`Production smoke failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log("Production smoke passed.");

async function check(name, url, options = {}) {
  const expected = options.expected ?? [200];
  try {
    const response = await fetch(url, {
      headers: options.headers ?? {}
    });
    const body = await response.text();
    const item = {
      ok: expected.includes(response.status),
      name,
      status: response.status,
      url,
      json: parseJson(body)
    };
    checks.push(item);
    return item;
  } catch (error) {
    const item = {
      ok: false,
      name,
      status: error instanceof Error ? error.message : "network_error",
      url
    };
    checks.push(item);
    return item;
  }
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
