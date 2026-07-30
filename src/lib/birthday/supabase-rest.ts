import { badRequest, serviceUnavailable, thirdPartyFailure, unauthorized } from "./errors";
import { hasPersistentSecretConfig } from "./crypto";
import type { AdminUser } from "./types";

export type QueryParam = readonly [string, string];

export interface SupabaseConfig {
  url: string;
  anonKey: string | null;
  serviceRoleKey: string | null;
}

export interface SupabaseReadyConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface SupabaseRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  authToken?: string;
  prefer?: string;
}

export function getSupabaseConfig(): SupabaseConfig {
  return {
    url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? null,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? null,
  };
}

export function hasSupabaseAuthConfig(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.anonKey);
}

export function hasSupabasePersistenceConfig(): boolean {
  const config = getSupabaseConfig();
  return Boolean(config.url && config.serviceRoleKey && hasPersistentSecretConfig());
}

export function requireSupabasePersistenceConfig(): SupabaseReadyConfig {
  const config = getSupabaseConfig();
  if (!config.url || !config.serviceRoleKey || !config.anonKey || !hasPersistentSecretConfig()) {
    throw serviceUnavailable(
      "Supabase URL, anon key, service role key, APP_ENCRYPTION_KEY, and SESSION_TOKEN_PEPPER are required",
    );
  }

  return {
    url: config.url,
    anonKey: config.anonKey,
    serviceRoleKey: config.serviceRoleKey,
  };
}

export function requireSupabaseAuthConfig(): SupabaseConfig & { anonKey: string } {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    throw serviceUnavailable("Supabase URL and anon key are required for magic link auth");
  }

  return { ...config, anonKey: config.anonKey };
}

export function select(columns = "*"): QueryParam {
  return ["select", columns];
}

export function eq(column: string, value: string | number | boolean): QueryParam {
  return [column, `eq.${String(value)}`];
}

export function inFilter(column: string, values: string[]): QueryParam {
  return [column, `in.(${values.join(",")})`];
}

export function order(column: string, ascending = true): QueryParam {
  return ["order", `${column}.${ascending ? "asc" : "desc"}`];
}

export function limit(value: number): QueryParam {
  return ["limit", String(value)];
}

export function query(params: QueryParam[]): string {
  const search = new URLSearchParams();
  for (const [key, value] of params) {
    search.append(key, value);
  }

  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export class SupabaseRestClient {
  private readonly config: SupabaseReadyConfig;

  constructor(config = requireSupabasePersistenceConfig()) {
    this.config = config;
  }

  async table<T>(
    table: string,
    params: QueryParam[] = [],
    options: SupabaseRequestOptions = {},
  ): Promise<T[]> {
    return this.request<T[]>(`/rest/v1/${table}${query(params)}`, options);
  }

  async rpc<T>(functionName: string, body: unknown): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${functionName}`, {
      method: "POST",
      body,
    });
  }

  private async request<T>(path: string, options: SupabaseRequestOptions): Promise<T> {
    const url = new URL(path, this.config.url);
    const key = this.config.serviceRoleKey;
    const headers = new Headers({
      apikey: key,
      authorization: `Bearer ${options.authToken ?? key}`,
    });

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    if (options.prefer) {
      headers.set("prefer", options.prefer);
    }

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (!response.ok) {
      throw await toSupabaseError(response);
    }

    const text = await response.text();
    if (response.status === 204 || !text) {
      return [] as T;
    }

    return JSON.parse(text) as T;
  }
}

export async function fetchSupabaseUser(accessToken: string): Promise<AdminUser> {
  const config = requireSupabaseAuthConfig();
  const response = await fetch(new URL("/auth/v1/user", config.url), {
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw unauthorized("Invalid Supabase access token");
    }

    throw thirdPartyFailure("Supabase auth rejected the access token", {
      status: response.status,
    });
  }

  const user = (await response.json()) as { id?: unknown; email?: unknown };
  if (typeof user.id !== "string" || typeof user.email !== "string") {
    throw thirdPartyFailure("Supabase auth returned an invalid user");
  }

  return { id: user.id, email: user.email.toLowerCase() };
}

export async function sendSupabaseMagicLink(email: string, redirectTo: string | null): Promise<void> {
  const config = requireSupabaseAuthConfig();
  assertAdminEmailAllowed(email);

  const body: Record<string, unknown> = {
    email,
    type: "magiclink",
  };

  if (redirectTo) {
    body.options = { email_redirect_to: redirectTo };
  }

  const response = await fetch(new URL("/auth/v1/otp", config.url), {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      authorization: `Bearer ${config.anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await toSupabaseError(response);
  }
}

export function assertAdminEmailAllowed(email: string): void {
  const rawAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;
  if (!rawAllowlist) {
    return;
  }

  const allowedEmails = rawAllowlist
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedEmails.includes(email.toLowerCase())) {
    throw badRequest("Email is not allowed for admin access");
  }
}

async function toSupabaseError(response: Response) {
  const text = await response.text();
  let details: Record<string, unknown> = { status: response.status };

  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    details = { ...details, ...body };
  } catch {
    details = { ...details, body: text };
  }

  return thirdPartyFailure("Supabase request failed", details);
}
