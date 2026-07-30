import type { NextRequest } from "next/server";
import { sendAdminMagicLink } from "@/lib/birthday/admin";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { parseMagicLink } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonObject(request);
    const input = parseMagicLink(body);
    await sendAdminMagicLink(input.email, input.redirectTo);

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
