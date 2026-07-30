import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { errorResponse, jsonResponse } from "@/lib/birthday/http";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { assertUuid } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const { campaignId } = await params;
    const admin = await adminForRequest(request);
    const analytics = await getBirthdayRepository().getAdminCampaignAnalytics(
      admin,
      assertUuid(campaignId, "campaignId"),
    );

    return jsonResponse({ analytics });
  } catch (error) {
    return errorResponse(error);
  }
}
