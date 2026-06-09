const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000";
const SESSION_TOKEN_KEY = "agentops.sessionToken";

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

export function getSessionToken() {
  try {
    return localStorage.getItem(SESSION_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveSessionToken(token: string) {
  try {
    const trimmed = token.trim();
    if (trimmed) localStorage.setItem(SESSION_TOKEN_KEY, trimmed);
    else localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Storage can be unavailable in strict browser contexts.
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getSessionToken();
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
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
