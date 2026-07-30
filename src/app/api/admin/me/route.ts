import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { errorResponse, jsonResponse } from "@/lib/birthday/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await adminForRequest(request);
    return jsonResponse({ admin });
  } catch (error) {
    return errorResponse(error);
  }
}
