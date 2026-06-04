const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";
const OPERATOR_TOKEN_KEY = "agentops.operatorToken";

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getOperatorToken() {
  try {
    return localStorage.getItem(OPERATOR_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveOperatorToken(token: string) {
  try {
    const trimmed = token.trim();
    if (trimmed) localStorage.setItem(OPERATOR_TOKEN_KEY, trimmed);
    else localStorage.removeItem(OPERATOR_TOKEN_KEY);
  } catch {
    // Storage can be unavailable in strict browser contexts.
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getOperatorToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = payload.error;
    throw new ApiClientError(
      response.status,
      typeof error === "object" && error?.message
        ? error.message
        : typeof error === "string"
          ? error
          : `API error ${response.status}`,
      typeof error === "object" ? error?.code : undefined,
      typeof error === "object" ? error?.details : undefined
    );
  }
  return response.json() as Promise<T>;
}

export { API_URL };
