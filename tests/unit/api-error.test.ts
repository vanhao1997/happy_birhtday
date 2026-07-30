import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "@/lib/api-error";

describe("API error messages", () => {
  it("reads the server error envelope", () => {
    expect(
      apiErrorMessage(
        { error: { code: "CONFLICT", message: "Session has not completed all chapters" } },
        "Fallback",
      ),
    ).toBe("Session has not completed all chapters");
  });

  it("supports legacy top-level messages and safe fallback", () => {
    expect(apiErrorMessage({ message: "Legacy error" }, "Fallback")).toBe("Legacy error");
    expect(apiErrorMessage({ error: { message: 409 } }, "Fallback")).toBe("Fallback");
  });
});
