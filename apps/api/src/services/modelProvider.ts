import type {
  AgentRole,
  ModelFinishReason,
  ModelProviderKind
} from "@agentops/shared";

export interface ContextItem {
  type: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDescriptorForModel {
  name: string;
  description: string;
}

export interface ModelRequest {
  missionId: string;
  agentRole: AgentRole;
  systemPrompt: string;
  userPrompt: string;
  context: ContextItem[];
  tools: ToolDescriptorForModel[];
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  metadata: Record<string, unknown>;
}

export interface ModelResponse {
  providerId: string;
  model: string;
  content: string;
  structured?: unknown;
  requestedToolCalls: unknown[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  };
  finishReason: ModelFinishReason;
  latencyMs: number;
  safetyFlags: string[];
}

export interface ModelProvider {
  id: string;
  kind: ModelProviderKind;
  capabilities: string[];
  complete(request: ModelRequest): Promise<ModelResponse>;
}
