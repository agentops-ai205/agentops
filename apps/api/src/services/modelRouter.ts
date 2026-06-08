import { config } from "../config.js";
import { badRequest, notFound } from "../http/errors.js";
import { redactContextItems } from "./modelRedaction.js";
import type { ModelProvider, ModelRequest } from "./modelProvider.js";
import { builtInProviders } from "./modelProviders.js";

export interface ModelRouterOptions {
  providerId?: string;
  maxTokens?: number;
  providers?: ModelProvider[];
}

export async function completeWithModelProvider(
  request: ModelRequest,
  options: ModelRouterOptions = {}
) {
  const provider = selectModelProvider(options.providerId, options.providers);
  const maxTokens = Math.min(options.maxTokens ?? request.maxTokens, config.modelMaxTokens);
  if (maxTokens < 64) {
    throw badRequest("MODEL_BUDGET_TOO_LOW", "Model max token budget is too low.", { max_tokens: maxTokens });
  }

  return provider.complete({
    ...request,
    maxTokens,
    timeoutMs: Math.min(request.timeoutMs, config.modelTimeoutMs),
    context: redactContextItems(request.context),
    metadata: {
      ...request.metadata,
      provider_id: provider.id,
      provider_kind: provider.kind,
      max_tokens: maxTokens
    }
  });
}

export function selectModelProvider(providerId?: string, providers = builtInProviders) {
  const requested = providerId ?? config.defaultModelProvider;
  const provider = providers.find((item) => item.id === requested);
  if (!provider) {
    throw notFound("MODEL_PROVIDER_NOT_FOUND", "Model provider not found.", {
      provider_id: requested,
      available: providers.map((item) => item.id)
    });
  }
  return provider;
}
