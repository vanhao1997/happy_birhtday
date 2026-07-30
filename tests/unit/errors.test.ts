import { describe, expect, it } from "vitest";
import { AppError, isAppError, normalizeError } from "@/lib/birthday/errors";
import { errorResponse } from "@/lib/birthday/http";

describe("application error normalization", () => {
  it("preserves an AppError shape created by another class identity", async () => {
    const foreignError = Object.assign(new Error("Session has not completed all chapters"), {
      name: "AppError",
      code: "CONFLICT",
      status: 409,
      details: { completed: 0, required: 4 },
    });

    expect(foreignError).not.toBeInstanceOf(AppError);
    expect(isAppError(foreignError)).toBe(true);
    expect(normalizeError(foreignError)).toBe(foreignError);

    const response = errorResponse(foreignError);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CONFLICT",
        message: "Session has not completed all chapters",
        details: { completed: 0, required: 4 },
      },
    });
  });

  it("rejects malformed lookalikes", () => {
    expect(
      isAppError({
        name: "AppError",
        code: "CONFLICT",
        message: "Invalid status",
        status: 200,
      }),
    ).toBe(false);
  });
});
