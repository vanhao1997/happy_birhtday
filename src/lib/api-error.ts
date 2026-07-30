export function apiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return fallback;
  }

  const payload = data as Record<string, unknown>;
  const nestedError = payload.error;
  if (typeof nestedError === "object" && nestedError !== null && !Array.isArray(nestedError)) {
    const message = (nestedError as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return typeof payload.message === "string" && payload.message.length > 0
    ? payload.message
    : fallback;
}
