import type { ContextItem } from "./modelProvider.js";

const sensitivePatterns = [
  /\b[A-Z0-9_]*(API_KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*["']?[^"'\s]+/gi,
  /\b(sk|pk)-[A-Za-z0-9_-]{12,}/g,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g
];

export function redactText(input: string) {
  return sensitivePatterns.reduce((text, pattern) => text.replace(pattern, "[REDACTED_SECRET]"), input);
}

export function redactContextItems(items: ContextItem[]) {
  return items.map((item) => ({
    ...item,
    content: redactText(item.content),
    metadata: redactMetadata(item.metadata ?? {})
  }));
}

function redactMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (/secret|token|password|api_key/i.test(key)) return [key, "[REDACTED_SECRET]"];
      if (typeof value === "string") return [key, redactText(value)];
      return [key, value];
    })
  );
}
