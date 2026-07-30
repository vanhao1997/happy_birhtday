import { forbidden, serviceUnavailable, unauthorized } from "./errors";
import { bearerToken } from "./http";
import {
  eq,
  fetchSupabaseUser,
  inFilter,
  limit,
  select,
  sendSupabaseMagicLink,
  SupabaseRestClient,
  requireSupabasePersistenceConfig,
} from "./supabase-rest";
import { assertUuid } from "./validation";
import type { AdminIdentity, AdminRole } from "./types";

interface WorkspaceMemberRow {
  workspace_id: string;
  user_id: string;
  email: string | null;
  role: AdminRole;
}

const writableRoles: AdminIdentity["role"][] = ["owner", "admin", "editor"];

export async function requireAdminIdentity(
  request: Request,
  workspaceIdValue: unknown,
): Promise<AdminIdentity> {
  requireSupabasePersistenceConfig();

  const accessToken = bearerToken(request);
  if (!accessToken) {
    throw unauthorized("Authorization: Bearer <Supabase access token> is required");
  }

  const workspaceId = assertUuid(workspaceIdValue, "workspaceId");
  const user = await fetchSupabaseUser(accessToken);
  const client = new SupabaseRestClient();
  const memberships = await client.table<WorkspaceMemberRow>("workspace_members", [
    select("workspace_id,user_id,email,role"),
    eq("workspace_id", workspaceId),
    eq("user_id", user.id),
    inFilter("role", writableRoles),
    limit(1),
  ]);

  const membership = memberships[0];
  if (!membership || !writableRoles.includes(membership.role as AdminIdentity["role"])) {
    throw forbidden("Admin workspace membership is required");
  }

  return {
    userId: user.id,
    email: user.email,
    role: membership.role as AdminIdentity["role"],
    workspaceId,
  };
}

export async function sendAdminMagicLink(email: string, redirectTo: string | null): Promise<void> {
  if (!process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw serviceUnavailable("Supabase URL is required for magic link auth");
  }

  await sendSupabaseMagicLink(email, redirectTo);
}
