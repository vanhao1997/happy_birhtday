import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/birthday/errors";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject, requestContext } from "@/lib/birthday/http";
import { parseRecordChoice } from "@/lib/birthday/validation";

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
    const repository = getBirthdayRepository();
    const result = await repository.recordChoice(
      token,
      parseRecordChoice(body),
      requestContext(request),
    );

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
