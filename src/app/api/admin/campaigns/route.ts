import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { parseCampaignInput } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await adminForRequest(request);
    const campaigns = await getBirthdayRepository().listAdminCampaigns(admin);

    return jsonResponse({ campaigns });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const campaign = await getBirthdayRepository().createAdminCampaign(
      admin,
      parseCampaignInput(body),
    );

    return jsonResponse({ campaign }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
