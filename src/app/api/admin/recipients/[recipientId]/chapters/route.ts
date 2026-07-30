import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { assertUuid, parseChaptersInput } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> },
) {
  try {
    const { recipientId } = await params;
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const result = await getBirthdayRepository().upsertAdminChapters(
      admin,
      assertUuid(recipientId, "recipientId"),
      parseChaptersInput(body),
    );

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
