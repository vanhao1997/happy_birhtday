import { describe, expect, it } from "vitest";
import { DemoBirthdayRepository } from "@/lib/birthday/demo-repository";
import { createDemoData } from "@/lib/birthday/demo-data";
import { toPublicChapterDTO } from "@/lib/birthday/dto";

const context = { ipHash: "test-ip", userAgent: "vitest" };

describe("demo birthday repository", () => {
  it("returns only picker-safe fields and distinct personalized stories", async () => {
    const data = createDemoData();
    const repository = new DemoBirthdayRepository(data);
    const result = await repository.getPublicCampaign(data.campaign.slug, context);

    expect(result.campaign.recipients).toHaveLength(3);
    expect(result.campaign.recipients.every((recipient) => recipient.character)).toBe(true);
    expect(result.campaign.recipients.map((recipient) => recipient.accent)).toEqual([
      "pear",
      "cyan",
      "coral",
    ]);
    expect(JSON.stringify(result)).not.toMatch(/voucher|codeCiphertext|tokenHash/i);

    for (const recipient of data.recipients) {
      const bodies = data.chapters
        .filter((chapter) => chapter.recipientId === recipient.id)
        .map((chapter) => chapter.body);
      expect(new Set(bodies).size).toBe(4);
      expect(bodies.join(" ")).toContain(recipient.displayName);
    }

    const started = await repository.startSession(
      {
        campaignSlug: data.campaign.slug,
        recipientId: data.recipients[0].id,
        clientEventId: "game-type-check",
      },
      context,
    );
    const gameTypes = [started.chapter.gameType];
    let chapter = started.chapter;

    for (let index = 0; index < 3; index += 1) {
      const result = await repository.recordChoice(
        started.token,
        {
          chapterId: chapter.id,
          choiceKey: chapter.options[0].key,
          answerText: null,
          clientEventId: `game-type-${index + 1}`,
          elapsedMs: 1000,
        },
        context,
      );
      chapter = result.nextChapter!;
      gameTypes.push(chapter.gameType);
    }

    expect(gameTypes).toEqual([
      "memory_piece",
      "detail_hunt",
      "message_unlock",
      "story_branch",
    ]);
  });

  it("keeps voucher hidden until all four chapters are recorded server-side", async () => {
    const data = createDemoData();
    const repository = new DemoBirthdayRepository(data);
    const publicCampaign = await repository.getPublicCampaign(data.campaign.slug, context);
    const recipient = publicCampaign.campaign.recipients[0];
    const started = await repository.startSession(
      {
        campaignSlug: data.campaign.slug,
        recipientId: recipient.id,
        clientEventId: "start-1",
      },
      context,
    );

    await expect(repository.completeSession(started.token, context)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });

    let chapter = started.chapter;
    for (let index = 0; index < 4; index += 1) {
      const result = await repository.recordChoice(
        started.token,
        {
          chapterId: chapter.id,
          choiceKey: chapter.options[0].key,
          answerText: null,
          clientEventId: `choice-${index + 1}`,
          elapsedMs: 1000,
        },
        context,
      );

      if (result.nextChapter) chapter = result.nextChapter;
    }

    const completed = await repository.completeSession(started.token, context);
    expect(completed.session.completedChapterCount).toBe(4);
    expect(completed.voucher.code.length).toBeGreaterThan(5);
    expect(completed.alreadyRevealed).toBe(false);

    const repeated = await repository.completeSession(started.token, context);
    expect(repeated.voucher.code).toBe(completed.voucher.code);
    expect(repeated.alreadyRevealed).toBe(true);
  });

  it("uses the chapter order fallback for invalid game metadata", () => {
    const data = createDemoData();
    const secondChapter = data.chapters.find((chapter) => chapter.orderIndex === 2)!;
    secondChapter.metadata.gameType = "unknown_game";

    expect(toPublicChapterDTO(secondChapter).gameType).toBe("detail_hunt");
  });

  it("scopes a session to its selected recipient", async () => {
    const data = createDemoData();
    const repository = new DemoBirthdayRepository(data);
    const started = await repository.startSession(
      {
        campaignSlug: data.campaign.slug,
        recipientId: data.recipients[0].id,
        clientEventId: null,
      },
      context,
    );
    const foreignChapter = data.chapters.find(
      (chapter) => chapter.recipientId === data.recipients[1].id,
    );

    await expect(
      repository.recordChoice(
        started.token,
        {
          chapterId: foreignChapter!.id,
          choiceKey: foreignChapter!.options[0].key,
          answerText: null,
          clientEventId: null,
          elapsedMs: null,
        },
        context,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("does not reveal an expired voucher", async () => {
    const data = createDemoData();
    data.vouchers[0].expiresAt = "2020-01-01T00:00:00.000Z";
    const repository = new DemoBirthdayRepository(data);
    const started = await repository.startSession(
      {
        campaignSlug: data.campaign.slug,
        recipientId: data.recipients[0].id,
        clientEventId: null,
      },
      context,
    );

    let chapter = started.chapter;
    for (let index = 0; index < 4; index += 1) {
      const result = await repository.recordChoice(
        started.token,
        {
          chapterId: chapter.id,
          choiceKey: chapter.options[0].key,
          answerText: null,
          clientEventId: `expired-${index}`,
          elapsedMs: null,
        },
        context,
      );
      if (result.nextChapter) chapter = result.nextChapter;
    }

    await expect(repository.completeSession(started.token, context)).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });
});
