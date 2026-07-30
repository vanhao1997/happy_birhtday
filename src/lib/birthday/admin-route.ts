import type { NextRequest } from "next/server";
import { badRequest } from "./errors";
import { getWorkspaceId } from "./http";
import { requireAdminIdentity } from "./admin";
import type { AdminIdentity, JsonObject } from "./types";

export async function adminForRequest(
  request: NextRequest,
  body?: JsonObject,
): Promise<AdminIdentity> {
  const workspaceId =
    request.nextUrl.searchParams.get("workspaceId") ?? getWorkspaceId(request, body);

  if (!workspaceId) {
    throw badRequest("workspaceId is required in x-workspace-id, query, or body");
  }

  return requireAdminIdentity(request, workspaceId);
}
