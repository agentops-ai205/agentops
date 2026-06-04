import type { AgentRole, RiskLevel } from "@agentops/shared";
import { forbidden, notFound } from "../http/errors.js";

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  risk: RiskLevel;
  allowedRoles: AgentRole[];
  requiresApproval: boolean;
  requiresSandbox: boolean;
  auditEventType: string;
}

export const toolDescriptors: ToolDescriptor[] = [
  {
    name: "policy_evaluate",
    description: "Evaluate an AgentOps policy action before execution.",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "low",
    allowedRoles: ["planner", "architect", "coder", "tester", "security", "reviewer", "metadev"],
    requiresApproval: false,
    requiresSandbox: false,
    auditEventType: "policy_evaluated"
  },
  {
    name: "run_command",
    description: "Run an allowlisted command through the controlled executor.",
    inputSchema: { type: "object", required: ["command"] },
    outputSchema: { type: "object" },
    risk: "medium",
    allowedRoles: ["tester", "coder"],
    requiresApproval: true,
    requiresSandbox: true,
    auditEventType: "command_executed"
  },
  {
    name: "propose_patch",
    description: "Create a patch proposal and store its diff as evidence.",
    inputSchema: { type: "object", required: ["files", "unified_diff"] },
    outputSchema: { type: "object" },
    risk: "medium",
    allowedRoles: ["coder", "architect", "metadev"],
    requiresApproval: false,
    requiresSandbox: false,
    auditEventType: "patch_proposed"
  },
  {
    name: "apply_patch",
    description: "Mark an approved patch proposal as ready for guarded application.",
    inputSchema: { type: "object", required: ["patch_id"] },
    outputSchema: { type: "object" },
    risk: "high",
    allowedRoles: ["coder", "reviewer", "release"],
    requiresApproval: true,
    requiresSandbox: true,
    auditEventType: "patch_apply_guarded"
  },
  {
    name: "create_evidence",
    description: "Attach immutable mission evidence.",
    inputSchema: { type: "object" },
    outputSchema: { type: "object" },
    risk: "low",
    allowedRoles: ["planner", "coder", "tester", "security", "reviewer", "documenter"],
    requiresApproval: false,
    requiresSandbox: false,
    auditEventType: "evidence_attached"
  }
];

export function getToolDescriptor(name: string) {
  return toolDescriptors.find((tool) => tool.name === name) ?? null;
}

export function assertToolRole(name: string, role: AgentRole) {
  const tool = getToolDescriptor(name);
  if (!tool) {
    throw notFound("TOOL_NOT_FOUND", "Tool not found.", { tool: name });
  }
  if (!tool.allowedRoles.includes(role)) {
    throw forbidden("TOOL_ROLE_NOT_ALLOWED", "Agent role is not allowed to use this tool.", {
      tool: name,
      role
    });
  }
  return tool;
}
