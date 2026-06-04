import type { AgentRole } from "@agentops/shared";
import type { ModelProvider, ModelRequest, ModelResponse } from "./modelProvider.js";

function response(
  providerId: string,
  model: string,
  startedAt: number,
  content: string,
  structured?: unknown
): ModelResponse {
  return {
    providerId,
    model,
    content,
    structured,
    requestedToolCalls: [],
    usage: {
      inputTokens: estimateTokens(content),
      outputTokens: estimateTokens(JSON.stringify(structured ?? {})),
      costUsd: 0
    },
    finishReason: "stop",
    latencyMs: Date.now() - startedAt,
    safetyFlags: []
  };
}

export const manualProvider: ModelProvider = {
  id: "manual",
  kind: "manual",
  capabilities: ["manual_control", "no_network"],
  async complete(request: ModelRequest) {
    const startedAt = Date.now();
    return response(
      this.id,
      "manual-control",
      startedAt,
      "Manual provider selected. No model inference was performed.",
      {
        role: request.agentRole,
        mode: "manual",
        recommendation: "Use deterministic AgentOps runner output."
      }
    );
  }
};

export const nullProvider: ModelProvider = {
  id: "null",
  kind: "null",
  capabilities: ["disabled", "no_network"],
  async complete(request: ModelRequest) {
    const startedAt = Date.now();
    return response(this.id, "null-provider", startedAt, "Model provider disabled.", {
      role: request.agentRole,
      mode: "null",
      recommendation: "Proceed without model augmentation."
    });
  }
};

export const fakeProvider: ModelProvider = {
  id: "fake",
  kind: "fake",
  capabilities: ["test_double", "structured_output", "no_network"],
  async complete(request: ModelRequest) {
    const startedAt = Date.now();
    const finding = fakeFinding(request.agentRole);
    return response(this.id, "fake-agentops-model", startedAt, finding, {
      role: request.agentRole,
      findings: [finding],
      context_items: request.context.length,
      tool_names: request.tools.map((tool) => tool.name)
    });
  }
};

export const builtInProviders = [manualProvider, nullProvider, fakeProvider];

function fakeFinding(role: AgentRole) {
  if (role === "planner") return "Fake provider confirms the plan should remain gated.";
  if (role === "tester") return "Fake provider recommends running tests before review.";
  if (role === "reviewer") return "Fake provider requests evidence inspection before close.";
  return `Fake provider has no specialized guidance for ${role}.`;
}

function estimateTokens(input: string) {
  return Math.ceil(input.length / 4);
}
