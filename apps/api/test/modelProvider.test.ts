import { describe, expect, it } from "vitest";
import { ApiError } from "../src/http/errors.js";
import { redactContextItems, redactText } from "../src/services/modelRedaction.js";
import { completeWithModelProvider, selectModelProvider } from "../src/services/modelRouter.js";

const request = {
  missionId: "mission_1",
  agentRole: "planner" as const,
  systemPrompt: "System",
  userPrompt: "User",
  context: [
    {
      type: "log",
      title: "env",
      content: "OPENAI_API_KEY=sk-testsecret123456",
      metadata: { token: "secret-token" }
    }
  ],
  tools: [{ name: "policy_evaluate", description: "Evaluate policy" }],
  maxTokens: 1200,
  temperature: 0.1,
  timeoutMs: 30_000,
  metadata: {}
};

describe("model providers", () => {
  it("selects built-in providers", () => {
    expect(selectModelProvider("manual").kind).toBe("manual");
    expect(selectModelProvider("fake").kind).toBe("fake");
  });

  it("throws for unknown providers", () => {
    expect(() => selectModelProvider("missing")).toThrow(ApiError);
  });

  it("redacts likely secrets from context", () => {
    expect(redactText("TOKEN=abc123")).toContain("[REDACTED_SECRET]");
    const [item] = redactContextItems(request.context);
    expect(item.content).toContain("[REDACTED_SECRET]");
    expect(item.metadata?.token).toBe("[REDACTED_SECRET]");
  });

  it("runs fake provider without network", async () => {
    const response = await completeWithModelProvider(request, { providerId: "fake" });

    expect(response.providerId).toBe("fake");
    expect(response.requestedToolCalls).toEqual([]);
    expect(response.usage?.costUsd).toBe(0);
  });
});
