import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export function findRustCoreBinary() {
  const candidates = [
    config.rustCoreCliPath,
    path.join(config.projectRoot, "target/debug/agentops"),
    path.join(config.projectRoot, "target/release/agentops")
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

export function buildRustCoreEnv() {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "RUST_BACKTRACE"]) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}
