import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/birthday/errors";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, requestContext } from "@/lib/birthday/http";

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

    const repository = getBirthdayRepository();
    const result = await repository.completeSession(token, requestContext(request));

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}
