import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  agents,
  memoryItems,
  missions,
  organizations,
  policies,
  projects,
  tools
} from "../db/schema.js";
import { id } from "./ids.js";

const now = () => new Date();

export async function seedDefaults() {
  const existing = await db.select({ id: projects.id }).from(projects).limit(1);
  if (existing.length > 0) return existing[0].id;

  const projectId = "com.agentops.os";
  const organizationId = "org.default";
  await db.insert(organizations).values({
    id: organizationId,
    name: "Default Organization",
    plan: "single_tenant",
    createdAt: now(),
    updatedAt: now()
  }).onConflictDoNothing();

  await db.insert(projects).values({
    id: projectId,
    organizationId,
    name: "AgentOps OS",
    type: "agentic_governance_platform",
    criticality: "high",
    owners: {
      product: "product-owner@example.com",
      technical: "technical-owner@example.com",
      security: "security-owner@example.com"
    },
    repos: ["local:/Users/m/Desktop/AgentOps"],
    createdAt: now(),
    updatedAt: now()
  });

  await db.insert(agents).values([
    agent("planner", "Mission Planner", ["mission_structuring", "scope_control"]),
    agent("architect", "System Architect", ["impact_mapping", "risk_strategy"]),
    agent("coder", "Controlled Coder", ["scoped_write", "patch_generation"]),
    agent("tester", "Verification Tester", ["tests", "builds", "regression"]),
    agent("security", "Security Reviewer", ["secrets", "permissions", "supply_chain"]),
    agent("reviewer", "Human-aligned Reviewer", ["quality_review", "maintainability"]),
    agent("metadev", "MetaDev Supervisor", ["improvement_proposals", "replay_analysis"])
  ]);

  await db.insert(policies).values([
    policy("deny_secrets_and_prod_paths", "deny", "critical"),
    policy("require_approval_for_auth_changes", "require_approval", "high"),
    policy("require_approval_for_database_changes", "require_approval", "high"),
    policy("require_sandbox_for_unlisted_command", "require_sandbox", "medium"),
    policy("require_approval_for_high_autonomy", "require_approval", "high")
  ]);

  await db.insert(tools).values([
    tool("npm-test", "npm run test", "medium"),
    tool("npm-build", "npm run build", "medium"),
    tool("cargo-test", "cargo test", "medium"),
    tool("policy-evaluate", undefined, "low")
  ]);

  await db.insert(memoryItems).values([
    {
      id: id("mem"),
      organizationId,
      projectId,
      type: "stack",
      content: "React, TypeScript, Vite, Fastify, PostgreSQL, Rust core/CLI.",
      source: ".agentops/memory/project.md",
      confidence: 0.95,
      expiresAt: null,
      reviewedAt: now(),
      createdAt: now()
    },
    {
      id: id("mem"),
      organizationId,
      projectId,
      type: "decision",
      content:
        "PostgreSQL est la base canonique; local et cloud utilisent DATABASE_URL et le meme schema.",
      source: "human_architecture_decision",
      confidence: 0.98,
      expiresAt: null,
      reviewedAt: now(),
      createdAt: now()
    }
  ]);

  const existingMission = await db
    .select()
    .from(missions)
    .where(eq(missions.id, "AOS-MIS-2026-BOOT01"));
  if (existingMission.length === 0) {
    await db.insert(missions).values({
      id: "AOS-MIS-2026-BOOT01",
      organizationId,
      projectId,
      title: "Initialiser le cockpit AgentOps OS",
      intent:
        "Rendre visibles missions, policies, approvals, evidence, audit et memoire pour gouverner les agents.",
      status: "WAITING_APPROVAL",
      riskLevel: "medium",
      autonomyLevel: 4,
      context: { product_area: "platform", repository: "AgentOps" },
      scope: { include: ["apps/**", "packages/**", ".agentops/**"], exclude: [".env*", "secrets/**"] },
      constraints: { no_raw_secrets: true, require_human_approval: true },
      successCriteria: ["API health ok", "Cockpit web visible", "Policy engine actif"],
      humanApproval: {
        before_execution: true,
        before_merge: true,
        before_policy_change: true
      },
      plan: {
        steps: [
          "Create project kernel",
          "Expose mission API",
          "Render operational cockpit",
          "Attach audit and evidence"
        ]
      },
      createdAt: now(),
      updatedAt: now(),
      closedAt: null
    });
  }

  return projectId;
}

function agent(role: string, name: string, capabilities: string[]) {
  return {
    id: `agent.${role}`,
    role,
    name,
    capabilities,
    model: "vendor-neutral",
    tools: ["policy-evaluate"],
    permissions: { governed_by: ".agentops/policies" },
    status: "available",
    score: 0.78,
    createdAt: now()
  };
}

function policy(name: string, decision: string, severity: string) {
  return {
    id: `policy.${name}`,
    name,
    rule: { source: "agentops-v1", deterministic: true },
    decision,
    severity,
    enabled: 1,
    createdAt: now()
  };
}

function tool(name: string, command: string | undefined, risk: string) {
  return {
    id: `tool.${name}`,
    name,
    command: command ?? null,
    inputSchema: {},
    outputSchema: {},
    risk,
    createdAt: now()
  };
}
