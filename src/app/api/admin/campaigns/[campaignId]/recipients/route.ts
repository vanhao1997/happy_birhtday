import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { assertUuid, parseRecipientInput } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const admin = await adminForRequest(request);
    const recipients = await getBirthdayRepository().listAdminRecipients(
      admin,
      assertUuid(campaignId, "campaignId"),
    );

    return jsonResponse({ recipients });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const recipient = await getBirthdayRepository().createAdminRecipient(
      admin,
      assertUuid(campaignId, "campaignId"),
      parseRecipientInput(body),
    );

    return jsonResponse({ recipient }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
