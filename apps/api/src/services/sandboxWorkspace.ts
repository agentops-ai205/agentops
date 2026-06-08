import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { stableJson } from "./canonicalJson.js";
import { sha256 } from "./hash.js";

export interface SandboxWorkspace {
  missionId: string;
  root: string;
  artifactsDir: string;
  manifestsDir: string;
}

export interface SandboxManifestInput {
  missionId: string;
  command: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  startedAt: string;
  finishedAt: string;
  executionCwd: string;
  sandbox: Record<string, unknown>;
}

export function safePathSegment(input: string) {
  return input.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unknown";
}

export function getSandboxWorkspace(missionId: string): SandboxWorkspace {
  const missionSegment = safePathSegment(missionId);
  const root = path.join(config.sandboxRoot, missionSegment);
  return {
    missionId,
    root,
    artifactsDir: path.join(root, "artifacts"),
    manifestsDir: path.join(root, "manifests")
  };
}

export async function ensureSandboxWorkspace(missionId: string) {
  const workspace = getSandboxWorkspace(missionId);
  await mkdir(workspace.artifactsDir, { recursive: true });
  await mkdir(workspace.manifestsDir, { recursive: true });
  return workspace;
}

export async function writeSandboxManifest(input: SandboxManifestInput) {
  const workspace = await ensureSandboxWorkspace(input.missionId);
  const hash = sha256(stableJson(input));
  const manifest = {
    ...input,
    manifestHash: hash
  };
  const filename = `${Date.now()}-${safePathSegment(input.command)}.json`;
  const manifestPath = path.join(workspace.manifestsDir, filename);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    manifest,
    manifestPath,
    manifestHash: hash,
    workspace
  };
}
