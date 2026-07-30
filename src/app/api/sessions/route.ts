import type { NextRequest } from "next/server";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject, requestContext } from "@/lib/birthday/http";
import { parseStartSession } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonObject(request);
    const repository = getBirthdayRepository();
    const result = await repository.startSession(parseStartSession(body), requestContext(request));

    return jsonResponse(result, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
