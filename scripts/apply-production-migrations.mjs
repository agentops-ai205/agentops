import { spawn } from "node:child_process";
import { argValue, loadEnvFile, mask } from "./env-utils.mjs";

const envPath = argValue(process.argv.slice(2), "--env", "deploy/production.env");
const fileEnv = loadEnvFile(envPath);
const databaseUrl = process.env.DATABASE_URL || fileEnv.DATABASE_URL;

if (!databaseUrl || /USER:PASSWORD@HOST|replace-with/i.test(databaseUrl)) {
  console.error(`DATABASE_URL is missing or still a template in ${envPath}.`);
  process.exit(1);
}

console.log(`Applying AgentOps migrations with DATABASE_URL=${mask(databaseUrl)}`);

const child = spawn("npm", ["--workspace", "@agentops/api", "run", "db:migrate"], {
  env: {
    ...process.env,
    ...fileEnv,
    DATABASE_URL: databaseUrl
  },
  stdio: "inherit"
});

child.on("exit", (code) => process.exit(code ?? 0));
