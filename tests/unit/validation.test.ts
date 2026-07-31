import { describe, expect, it } from "vitest";
import {
  parsePixelQuestEvent,
  parseRecipientInput,
  parseStartSession,
} from "@/lib/birthday/validation";

function chapter(orderIndex: number) {
  return {
    orderIndex,
    title: `Chương ${orderIndex}`,
    body: "Một đoạn nội dung cá nhân.",
    prompt: "Bạn chọn điều gì?",
    options: [{ key: "one", label: "Lựa chọn một" }],
    isPublished: true,
    metadata: {},
  };
}

describe("public and admin input validation", () => {
  it("accepts a valid session start", () => {
    expect(
      parseStartSession({
        campaignSlug: "thang-8-ruc-ro",
        recipientId: "33333333-3333-4333-8333-333333333331",
        clientEventId: "client-1",
      }),
    ).toMatchObject({ campaignSlug: "thang-8-ruc-ro" });
  });

  it("accepts only the three pixel quest event names", () => {
    expect(parsePixelQuestEvent({
      eventName: "pixel_quest_checkpoint",
      chapterId: "44444444-0001-4001-8001-000000000001",
      checkpointId: "childhood-home",
      clientEventId: "pixel-checkpoint-1",
      moveCount: 5,
    })).toMatchObject({ checkpointId: "childhood-home", moveCount: 5 });

    expect(() => parsePixelQuestEvent({
      eventName: "voucher_revealed",
      chapterId: "44444444-0001-4001-8001-000000000001",
      checkpointId: null,
      clientEventId: "forged-event",
    })).toThrow(/not an allowed pixel quest event/);
  });

  it("requires exactly four chapters for each recipient", () => {
    expect(() =>
      parseRecipientInput({
        slug: "mai",
        displayName: "Mai",
        relationLabel: "Người giữ nhịp dự án",
        birthdayDate: "2026-08-12",
        avatarUrl: null,
        status: "active",
        metadata: {},
        chapters: [chapter(1), chapter(2), chapter(3)],
        voucher: null,
      }),
    ).toThrow(/exactly 4/);
  });
});
