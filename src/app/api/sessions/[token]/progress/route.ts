import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/birthday/errors";
import { errorResponse, jsonResponse, readJsonObject, requestContext } from "@/lib/birthday/http";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { parseQuestProgress } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    if (token.length < 32 || token.length > 256) {
      throw badRequest("Invalid session token");
    }

    const body = await readJsonObject(request);
    const result = await getBirthdayRepository().recordQuestProgress(
      token,
      parseQuestProgress(body),
      requestContext(request),
    );

    return jsonResponse(result, result.duplicate ? 200 : 201);
  } catch (error) {
    return errorResponse(error);
  }
}
