import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { assertUuid, parseRecipientPatch } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> },
) {
  try {
    const { recipientId } = await params;
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const recipient = await getBirthdayRepository().updateAdminRecipient(
      admin,
      assertUuid(recipientId, "recipientId"),
      parseRecipientPatch(body),
    );

    return jsonResponse({ recipient });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> },
) {
  try {
    const { recipientId } = await params;
    const admin = await adminForRequest(request);
    const result = await getBirthdayRepository().deleteAdminRecipient(
      admin,
      assertUuid(recipientId, "recipientId"),
    );

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
