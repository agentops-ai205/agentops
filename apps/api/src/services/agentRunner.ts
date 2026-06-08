import type { AgentRole, MissionStatus, RiskLevel } from "@agentops/shared";
import { toolDescriptors } from "./toolRegistry.js";
import type { MissionRow } from "./missionService.js";
import { createDefaultPlan } from "./missionService.js";
import { completeWithModelProvider } from "./modelRouter.js";
import type { ModelResponse } from "./modelProvider.js";

export interface AgentRunResult {
  status: "completed" | "blocked" | "needs_approval" | "failed";
  role: AgentRole;
  summary: string;
  proposedStatus?: MissionStatus;
  proposedPlan?: Record<string, unknown>;
  recommendedCommands: string[];
  findings: string[];
  residualRisk: RiskLevel;
  model?: {
    providerId: string;
    model: string;
    content: string;
    usage?: ModelResponse["usage"];
    safetyFlags: string[];
  };
  evidence: {
    type: "plan" | "report" | "review";
    title: string;
    content: string;
    metadata: Record<string, unknown>;
  };
}

export interface AgentProviderOptions {
  providerId?: string;
  maxTokens?: number;
  context?: Record<string, unknown>;
}

export function runDeterministicAgent(mission: MissionRow, role: AgentRole): AgentRunResult {
  if (role === "planner") return runPlanner(mission);
  if (role === "tester") return runTester(mission);
  if (role === "reviewer") return runReviewer(mission);

  return {
    status: "blocked",
    role,
    summary: `No deterministic runner is implemented for ${role}.`,
    recommendedCommands: [],
    findings: [`Runner ${role} requires a future model provider or dedicated implementation.`],
    residualRisk: mission.riskLevel as RiskLevel,
    evidence: {
      type: "report",
      title: `${role} runner blocked`,
      content: `Agent role ${role} has no deterministic runner in phase 6.`,
      metadata: { role, reason: "runner_not_implemented" }
    }
  };
}

export async function runAgentWithModelProvider(
  mission: MissionRow,
  role: AgentRole,
  options: AgentProviderOptions = {}
) {
  const deterministic = runDeterministicAgent(mission, role);
  const model = await completeWithModelProvider(
    {
      missionId: mission.id,
      agentRole: role,
      systemPrompt:
        "You are an AgentOps model provider. Provide concise, controlled guidance only. Do not request direct filesystem mutation.",
      userPrompt: [
        `Mission: ${mission.title}`,
        `Intent: ${mission.intent}`,
        `Status: ${mission.status}`,
        `Risk: ${mission.riskLevel}`,
        `Deterministic summary: ${deterministic.summary}`
      ].join("\n"),
      context: [
        {
          type: "mission",
          title: mission.title,
          content: JSON.stringify({
            intent: mission.intent,
            status: mission.status,
            scope: mission.scope,
            constraints: mission.constraints,
            context: options.context ?? {}
          }),
          metadata: { mission_id: mission.id }
        }
      ],
      tools: toolDescriptors.map((tool) => ({ name: tool.name, description: tool.description })),
      maxTokens: options.maxTokens ?? 1200,
      temperature: 0.1,
      timeoutMs: 30_000,
      metadata: { deterministic_status: deterministic.status }
    },
    { providerId: options.providerId, maxTokens: options.maxTokens }
  );

  return {
    ...deterministic,
    findings: [...deterministic.findings, `Model provider ${model.providerId} completed.`],
    model: {
      providerId: model.providerId,
      model: model.model,
      content: model.content,
      usage: model.usage,
      safetyFlags: model.safetyFlags
    },
    evidence: {
      ...deterministic.evidence,
      content: `${deterministic.evidence.content}\n\nModel provider output:\n${model.content}`,
      metadata: {
        ...deterministic.evidence.metadata,
        model_provider_id: model.providerId,
        model: model.model,
        model_usage: model.usage,
        model_safety_flags: model.safetyFlags
      }
    }
  };
}

function runPlanner(mission: MissionRow): AgentRunResult {
  const plan = createDefaultPlan(mission);
  const proposedStatus: MissionStatus = mission.autonomyLevel >= 3 ? "WAITING_APPROVAL" : "APPROVED";
  return {
    status: "completed",
    role: "planner",
    summary: "Deterministic planner produced a governed mission plan.",
    proposedStatus,
    proposedPlan: plan,
    recommendedCommands: [],
    findings: [
      "Scope and exclusions must be validated before execution.",
      "Evidence and audit are required before close."
    ],
    residualRisk: mission.riskLevel as RiskLevel,
    evidence: {
      type: "plan",
      title: `${mission.title} deterministic plan`,
      content: JSON.stringify(plan, null, 2),
      metadata: { proposed_status: proposedStatus, role: "planner" }
    }
  };
}

function runTester(mission: MissionRow): AgentRunResult {
  const commands = ["npm run test", "npm run build"];
  return {
    status: "completed",
    role: "tester",
    summary: "Deterministic tester selected baseline verification commands.",
    recommendedCommands: commands,
    findings: [
      "Run tests before evaluation.",
      "Run build before human review.",
      `Current mission status is ${mission.status}.`
    ],
    residualRisk: mission.riskLevel as RiskLevel,
    evidence: {
      type: "report",
      title: `${mission.title} test plan`,
      content: `Recommended verification commands:\n${commands.map((command) => `- ${command}`).join("\n")}`,
      metadata: { commands, role: "tester" }
    }
  };
}

function runReviewer(mission: MissionRow): AgentRunResult {
  const needsEvidence = ["DRAFT", "PLANNED", "WAITING_APPROVAL", "APPROVED"].includes(mission.status);
  return {
    status: needsEvidence ? "needs_approval" : "completed",
    role: "reviewer",
    summary: needsEvidence
      ? "Reviewer requires execution evidence before final approval."
      : "Reviewer found the mission ready for deeper human review.",
    proposedStatus: needsEvidence ? undefined : "HUMAN_REVIEW",
    recommendedCommands: [],
    findings: [
      needsEvidence ? "Attach test/build evidence before close." : "Proceed to human review gate.",
      `Risk level remains ${mission.riskLevel}.`
    ],
    residualRisk: mission.riskLevel as RiskLevel,
    evidence: {
      type: "review",
      title: `${mission.title} deterministic review`,
      content: needsEvidence
        ? "Mission needs more evidence before approval."
        : "Mission has progressed beyond initial execution gates and can enter human review.",
      metadata: { role: "reviewer", needs_evidence: needsEvidence }
    }
  };
}
