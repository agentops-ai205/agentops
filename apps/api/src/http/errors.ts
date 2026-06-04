export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFound(code: string, message: string, details?: Record<string, unknown>) {
  return new ApiError(404, code, message, details);
}

export function conflict(code: string, message: string, details?: Record<string, unknown>) {
  return new ApiError(409, code, message, details);
}

export function forbidden(code: string, message: string, details?: Record<string, unknown>) {
  return new ApiError(403, code, message, details);
}

export function badRequest(code: string, message: string, details?: Record<string, unknown>) {
  return new ApiError(400, code, message, details);
}
