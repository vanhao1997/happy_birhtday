export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: string,
    message: string,
    status = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: Record<string, unknown>) {
  return new AppError("BAD_REQUEST", message, 400, details);
}

export function unauthorized(message = "Authentication required") {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "Permission denied") {
  return new AppError("FORBIDDEN", message, 403);
}

export function notFound(message = "Resource not found") {
  return new AppError("NOT_FOUND", message, 404);
}

export function conflict(message: string, details?: Record<string, unknown>) {
  return new AppError("CONFLICT", message, 409, details);
}

export function serviceUnavailable(message: string) {
  return new AppError("SERVICE_UNAVAILABLE", message, 503);
}

export function thirdPartyFailure(message: string, details?: Record<string, unknown>) {
  return new AppError("THIRD_PARTY_FAILURE", message, 502, details);
}

export function isAppError(error: unknown): error is AppError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as Partial<AppError>;
  return (
    candidate.name === "AppError" &&
    typeof candidate.code === "string" &&
    candidate.code.length > 0 &&
    typeof candidate.message === "string" &&
    Number.isInteger(candidate.status) &&
    (candidate.status ?? 0) >= 400 &&
    (candidate.status ?? 0) <= 599 &&
    (candidate.details === undefined ||
      (typeof candidate.details === "object" &&
        candidate.details !== null &&
        !Array.isArray(candidate.details)))
  );
}

export function normalizeError(error: unknown): AppError {
  // HMR can load two AppError class identities; validate the wire shape instead.
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", error.message, 500);
  }

  return new AppError("INTERNAL_ERROR", "Unexpected error", 500);
}
