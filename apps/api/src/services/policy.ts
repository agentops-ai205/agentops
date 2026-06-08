import { spawnSync } from "node:child_process";
import { policyDecisions, type PolicyAction, type PolicyDecision } from "@agentops/shared";
import { config } from "../config.js";
import { buildRustCoreEnv, findRustCoreBinary } from "./rustCore.js";

export interface PolicyResult {
  decision: PolicyDecision;
  reason: string;
  matched_rule: string;
  approver_role?: string;
  engine: "rust_core" | "typescript_fallback";
  kernel_version?: string;
  fallback_reason?: string;
}

const secretPatterns = [/^\.env($|\.)/, /^secrets\//, /^infra\/prod\//];
const authPatterns = [/^auth\//, /^middleware\/auth/, /^src\/auth\//];
const databasePatterns = [/^database\//, /^db\//, /migrations\//];
const agentopsGovernancePatterns = [
  /^\.agentops\/policies\//,
  /^\.agentops\/agents\//,
  /^\.agentops\/agentops\.yml$/
];
const allowedCommands = new Set([
  "npm run test",
  "npm run typecheck",
  "npm run build",
  "cargo test",
  "cargo build"
]);
const destructiveCommandPatterns = [
  /rm\s+-rf\s+\*/,
  /rm\s+-rf\s+\//,
  /curl\s+.*\|\s*sh/,
  /^ssh\s+/,
  /^sudo\s+/
];

function matchesAny(path: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(path));
}

function evaluatePolicyFallback(action: PolicyAction, fallbackReason?: string): PolicyResult {
  const targetPath = action.path?.replace(/^\.\//, "") ?? "";

  if (targetPath && matchesAny(targetPath, secretPatterns)) {
    return {
      decision: "deny",
      reason: "Agents cannot read or write raw secrets, production infra, or env files.",
      matched_rule: "deny_secrets_and_prod_paths",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  if (action.command) {
    const command = action.command.trim();
    if (destructiveCommandPatterns.some((pattern) => pattern.test(command))) {
      return {
        decision: "deny",
        reason: "Destructive or exfiltration-prone command blocked by command policy.",
        matched_rule: "deny_destructive_commands",
        engine: "typescript_fallback",
        fallback_reason: fallbackReason
      };
    }

    if (!allowedCommands.has(command)) {
      return {
        decision: "require_sandbox",
        reason: "Command is not in the workflow allowlist and must run in a stricter sandbox.",
        matched_rule: "require_sandbox_for_unlisted_command",
        engine: "typescript_fallback",
        fallback_reason: fallbackReason
      };
    }
  }

  if (targetPath && matchesAny(targetPath, authPatterns)) {
    return {
      decision: "require_approval",
      reason: "Authentication changes require security owner and technical owner review.",
      matched_rule: "require_approval_for_auth_changes",
      approver_role: "security_owner",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  if (
    targetPath &&
    (matchesAny(targetPath, databasePatterns) || action.type === "database_schema_change")
  ) {
    return {
      decision: "require_approval",
      reason: "Database changes require explicit technical and data owner approval.",
      matched_rule: "require_approval_for_database_changes",
      approver_role: "technical_owner",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  if (
    targetPath &&
    matchesAny(targetPath, agentopsGovernancePatterns) &&
    action.agent_role === "metadev"
  ) {
    return {
      decision: "require_approval",
      reason: "MetaDev may propose governance changes but cannot apply them without human approval.",
      matched_rule: "require_approval_for_agentops_governance_changes",
      approver_role: "governance_owner",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  if (
    action.type === "self_improvement_apply" ||
    action.type === "production_deploy" ||
    action.autonomy_level >= 6
  ) {
    return {
      decision: "require_approval",
      reason: "High autonomy, production, and self-improvement application require human approval.",
      matched_rule: "require_approval_for_high_autonomy",
      approver_role: "governance_owner",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  if (action.risk_level === "critical") {
    return {
      decision: "require_review",
      reason: "Critical risk actions may proceed only with explicit review evidence.",
      matched_rule: "require_review_for_critical_risk",
      engine: "typescript_fallback",
      fallback_reason: fallbackReason
    };
  }

  return {
    decision: "allow",
    reason: "Action is inside declared AgentOps v1 permissions.",
    matched_rule: "allow_scoped_action",
    engine: "typescript_fallback",
    fallback_reason: fallbackReason
  };
}

export function evaluatePolicy(action: PolicyAction): PolicyResult {
  if (config.policyEngine === "typescript") {
    return evaluatePolicyFallback(action, "typescript engine explicitly selected");
  }

  const rustResult = evaluatePolicyWithRust(action);
  if (rustResult.result) return rustResult.result;

  if (config.policyEngine === "rust_core_strict") {
    throw new Error(`Rust policy core unavailable: ${rustResult.error}`);
  }

  return evaluatePolicyFallback(action, rustResult.error);
}

function evaluatePolicyWithRust(action: PolicyAction): { result?: PolicyResult; error?: string } {
  const binary = findRustCoreBinary();
  if (!binary) return { error: "agentops Rust CLI binary not found" };

  const child = spawnSync(
    binary,
    ["policy-test", "--input-json", JSON.stringify(toRustPolicyAction(action))],
    {
      cwd: config.projectRoot,
      encoding: "utf8",
      timeout: config.rustPolicyTimeoutMs,
      env: buildRustCoreEnv()
    }
  );

  if (child.error) return { error: child.error.message };
  if (child.status !== 0) {
    return {
      error: child.stderr?.trim() || child.stdout?.trim() || `Rust policy core exited ${child.status}`
    };
  }

  try {
    return { result: parseRustPolicyResult(child.stdout) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Rust policy core returned invalid JSON"
    };
  }
}

function toRustPolicyAction(action: PolicyAction) {
  return {
    type: action.type,
    path: action.path,
    command: action.command,
    agent_role: action.agent_role,
    autonomy_level: action.autonomy_level,
    risk_level: action.risk_level
  };
}

function parseRustPolicyResult(stdout: string): PolicyResult {
  const parsed = JSON.parse(stdout) as Partial<PolicyResult>;
  if (!parsed.decision || !policyDecisions.includes(parsed.decision)) {
    throw new Error("Rust policy result has an unknown decision");
  }
  if (!parsed.reason || !parsed.matched_rule) {
    throw new Error("Rust policy result is missing reason or matched_rule");
  }
  return {
    decision: parsed.decision,
    reason: parsed.reason,
    matched_rule: parsed.matched_rule,
    approver_role: parsed.approver_role,
    engine: "rust_core",
    kernel_version: parsed.kernel_version
  };
}
