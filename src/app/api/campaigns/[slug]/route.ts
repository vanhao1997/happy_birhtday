import type { NextRequest } from "next/server";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, requestContext } from "@/lib/birthday/http";
import { assertSlug } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const repository = getBirthdayRepository();
    const result = await repository.getPublicCampaign(assertSlug(slug, "slug"), requestContext(request));

    return jsonResponse({
      ...result,
      storageMode: repository.mode,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
