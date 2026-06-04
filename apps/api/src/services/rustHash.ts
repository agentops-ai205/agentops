import { spawnSync } from "node:child_process";
import { config } from "../config.js";
import { stableJson } from "./canonicalJson.js";
import { sha256 } from "./hash.js";
import { buildRustCoreEnv, findRustCoreBinary } from "./rustCore.js";

export interface RustHashResult {
  hash: string;
  engine: "rust_core" | "typescript_fallback";
  fallbackReason?: string;
}

export function hashJsonWithRust(value: unknown): RustHashResult {
  const input = JSON.stringify(value);
  const binary = findRustCoreBinary();
  if (!binary) {
    return fallback(value, "agentops Rust CLI binary not found");
  }

  const child = spawnSync(binary, ["hash-json", "--input-json", input], {
    cwd: config.projectRoot,
    encoding: "utf8",
    timeout: config.rustPolicyTimeoutMs,
    env: buildRustCoreEnv()
  });

  if (child.error) return fallback(value, child.error.message);
  if (child.status !== 0) {
    return fallback(
      value,
      child.stderr?.trim() || child.stdout?.trim() || `Rust hash core exited ${child.status}`
    );
  }

  const hash = child.stdout.trim();
  if (!hash.startsWith("sha256:")) {
    return fallback(value, "Rust hash core returned an invalid hash");
  }

  return { hash, engine: "rust_core" };
}

function fallback(value: unknown, fallbackReason: string): RustHashResult {
  return {
    hash: sha256(stableJson(value)),
    engine: "typescript_fallback",
    fallbackReason
  };
}
