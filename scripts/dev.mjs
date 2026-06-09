import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const root = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] ?? "dev";

const commands = {
  dev: [
    ["api", "npm", ["run", "dev:api"]],
    ["web", "npm", ["run", "dev:web"]]
  ],
  local: [
    ["api-local", "npm", ["run", "dev:api:local"]],
    ["web", "npm", ["run", "dev:web"]]
  ],
  start: [
    ["api", "npm", ["--workspace", "@agentops/api", "run", "start"]],
    ["web", "npm", ["--workspace", "@agentops/web", "run", "preview", "--", "--host", "127.0.0.1"]]
  ]
};

const selected = commands[mode];
if (!selected) {
  console.error(`Unknown dev mode "${mode}". Expected one of: ${Object.keys(commands).join(", ")}.`);
  process.exit(1);
}

const children = selected.map(([name, command, args]) => {
  const child = spawn(command, args, {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  prefixStream(name, child.stdout);
  prefixStream(name, child.stderr);
  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`[${name}] ${error.message}`);
    shuttingDown = true;
    stopChildren(child);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren(child);
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
  return child;
});

let shuttingDown = false;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChildren();
    process.exit(0);
  });
}

function prefixStream(name, stream) {
  const lines = readline.createInterface({ input: stream });
  lines.on("line", (line) => {
    console.log(`[${name}] ${line}`);
  });
}

function stopChildren(except) {
  for (const child of children) {
    if (child !== except && !child.killed) child.kill("SIGTERM");
  }
}
