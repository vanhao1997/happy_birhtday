import type { NextRequest } from "next/server";
import { badRequest, isAppError, normalizeError } from "./errors";
import { hashRequestValue } from "./crypto";
import type { JsonObject, RequestContext } from "./types";

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(error: unknown): Response {
  const normalized = normalizeError(error);

  if (normalized.status >= 500) {
    console.error("[birthday-api]", normalized.code, normalized.message, normalized.details ?? {});
  }

  return jsonResponse(
    {
      error: {
        code: normalized.code,
        message: normalized.status >= 500 ? "Internal server error" : normalized.message,
        details: normalized.status >= 500 ? undefined : normalized.details,
      },
    },
    normalized.status,
  );
}

export async function readJsonObject(request: Request): Promise<JsonObject> {
  try {
    const body = (await request.json()) as unknown;
    if (!isPlainObject(body)) {
      throw badRequest("JSON body must be an object");
    }

    return body;
  } catch (error) {
    if (isAppError(error)) {
      throw error;
    }

    throw badRequest("Invalid JSON body");
  }
}

export function requestContext(request: NextRequest | Request): RequestContext {
  const headers = request.headers;
  const forwardedFor = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const realIp = headers.get("x-real-ip");
  const userAgent = headers.get("user-agent");

  return {
    ipHash: hashRequestValue(forwardedFor ?? realIp),
    userAgent,
  };
}

export function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export function getWorkspaceId(
  request: Request,
  body?: Record<string, unknown>,
): string | null {
  const headerValue = request.headers.get("x-workspace-id");
  const bodyValue = typeof body?.workspaceId === "string" ? body.workspaceId : null;
  return headerValue ?? bodyValue;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
