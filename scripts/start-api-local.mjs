import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const child = spawn("npm", ["--workspace", "@agentops/api", "run", "start:local"], {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
