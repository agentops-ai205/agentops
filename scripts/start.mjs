import { spawn } from "node:child_process";

const args = process.argv.slice(2);

const command =
  args[0] === "api-local"
    ? ["npm", ["--workspace", "@agentops/api", "run", "start:local"]]
    : [
        "npx",
        [
          "concurrently",
          "-n",
          "api,web",
          "-c",
          "cyan,green",
          "npm --workspace @agentops/api run start",
          "npm --workspace @agentops/web run preview -- --host 127.0.0.1"
        ]
      ];

const child = spawn(command[0], command[1], {
  cwd: new URL("..", import.meta.url),
  env: process.env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
