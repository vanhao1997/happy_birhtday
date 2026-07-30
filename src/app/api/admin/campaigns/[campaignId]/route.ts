import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { assertUuid, parseCampaignPatch } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const admin = await adminForRequest(request);
    const campaign = await getBirthdayRepository().getAdminCampaign(
      admin,
      assertUuid(campaignId, "campaignId"),
    );

    return jsonResponse({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const campaign = await getBirthdayRepository().updateAdminCampaign(
      admin,
      assertUuid(campaignId, "campaignId"),
      parseCampaignPatch(body),
    );

    return jsonResponse({ campaign });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const admin = await adminForRequest(request);
    const result = await getBirthdayRepository().deleteAdminCampaign(
      admin,
      assertUuid(campaignId, "campaignId"),
    );

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
