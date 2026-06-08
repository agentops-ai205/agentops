import { argValue } from "./env-utils.mjs";

const args = process.argv.slice(2);
const apiUrl = stripTrailingSlash(
  argValue(args, "--api", process.env.AGENTOPS_API_URL || "https://capable-cat-f6133c.netlify.app/api")
);
const webUrl = stripTrailingSlash(
  argValue(args, "--web", process.env.AGENTOPS_WEB_URL || "https://capable-cat-f6133c.netlify.app")
);
const operatorToken = process.env.AGENTOPS_OPERATOR_TOKEN;

const checks = [];

await check("web:index", webUrl);
await check("api:live", `${apiUrl}/live`);
await check("api:ready", `${apiUrl}/ready`, { expected: [200, 503] });
await check("api:overview", `${apiUrl}/v1/overview`, {
  headers: operatorToken ? { authorization: `Bearer ${operatorToken}` } : {},
  expected: operatorToken ? [200] : [200, 401]
});

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
    checks.push({
      ok: expected.includes(response.status),
      name,
      status: response.status,
      url
    });
  } catch (error) {
    checks.push({
      ok: false,
      name,
      status: error instanceof Error ? error.message : "network_error",
      url
    });
  }
}

function stripTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}
