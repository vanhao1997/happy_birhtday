import type { NextRequest } from "next/server";
import { adminForRequest } from "@/lib/birthday/admin-route";
import { getBirthdayRepository } from "@/lib/birthday/repository";
import { errorResponse, jsonResponse, readJsonObject } from "@/lib/birthday/http";
import { assertUuid, parseVoucherInput } from "@/lib/birthday/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> },
) {
  try {
    const { recipientId } = await params;
    const body = await readJsonObject(request);
    const admin = await adminForRequest(request, body);
    const voucher = await getBirthdayRepository().upsertAdminVoucher(
      admin,
      assertUuid(recipientId, "recipientId"),
      parseVoucherInput(body),
    );

    return jsonResponse({
      voucher: {
        id: voucher.id,
        title: voucher.title,
        description: voucher.description,
        codeHint: voucher.codeHint,
        terms: voucher.terms,
        expiresAt: voucher.expiresAt,
        revealedAt: voucher.revealedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
