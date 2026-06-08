import { argValue, loadEnvFile, mask } from "./env-utils.mjs";

const args = process.argv.slice(2);
const envPath = argValue(args, "--env", "deploy/production.env");
const apiUrl = stripTrailingSlash(argValue(args, "--api", process.env.AGENTOPS_API_URL));
const fileEnv = loadEnvFile(envPath);
const operatorToken = process.env.AGENTOPS_OPERATOR_TOKEN || fileEnv.AGENTOPS_OPERATOR_TOKEN;

if (!apiUrl) {
  console.error("Missing --api or AGENTOPS_API_URL.");
  process.exit(1);
}

if (!operatorToken || /replace-with/i.test(operatorToken)) {
  console.error(`AGENTOPS_OPERATOR_TOKEN is missing or still a template in ${envPath}.`);
  process.exit(1);
}

const response = await fetch(`${apiUrl}/v1/bootstrap`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${operatorToken}`
  }
});

const body = await response.text();
if (!response.ok) {
  console.error(`Bootstrap failed ${response.status}: ${body}`);
  process.exit(1);
}

console.log(`Bootstrap ok for ${apiUrl} using token ${mask(operatorToken)}.`);
console.log(body);

function stripTrailingSlash(value = "") {
  return value.replace(/\/+$/, "");
}
