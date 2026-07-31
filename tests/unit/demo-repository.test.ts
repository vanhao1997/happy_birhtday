import { describe, expect, it } from "vitest";
import { DemoBirthdayRepository } from "@/lib/birthday/demo-repository";
import { createDemoData } from "@/lib/birthday/demo-data";
import { DEFAULT_PIXEL_QUEST, toPublicChapterDTO } from "@/lib/birthday/dto";
import type { GameEvent } from "@/lib/birthday/types";

const context = { ipHash: "test-ip", userAgent: "vitest" };

describe("demo birthday repository", () => {
  it("returns only picker-safe fields and distinct personalized stories", async () => {
    const data = createDemoData();
    const repository = new DemoBirthdayRepository(data);
    const result = await repository.getPublicCampaign(data.campaign.slug, context);

    expect(result.campaign.recipients).toHaveLength(3);
    expect(result.campaign.recipients.every((recipient) => recipient.character)).toBe(true);
    expect(result.campaign.recipients.every((recipient) => recipient.childCharacter.name)).toBe(true);
    expect(result.campaign.recipients.every((recipient) => recipient.childCharacter.trait)).toBe(true);
    expect(result.campaign.recipients.map((recipient) => recipient.childCharacter.archetype)).toEqual([
      "princess",
      "prince",
      "emperor",
    ]);
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

  it("returns only safe childhood photos from chapter metadata", () => {
    const data = createDemoData();
    const chapter = data.chapters[0];
    chapter.metadata.memoryImages = [
      {
        url: "https://images.example.com/mai-01.jpg",
        alt: "Mai hồi nhỏ bên chiếc xe đạp",
        caption: "Chiếc xe đạp đầu tiên",
      },
      {
        url: "javascript:alert(1)",
        alt: "unsafe",
        caption: "unsafe",
      },
      { url: "https://images.example.com/mai-02.jpg", caption: "Ngày đầu đi học" },
      { url: "https://images.example.com/mai-03.jpg", caption: "Một buổi hè" },
      { url: "https://images.example.com/mai-04.jpg", caption: "Không được trả về" },
    ];

    const result = toPublicChapterDTO(chapter);

    expect(result.memoryImages).toHaveLength(3);
    expect(result.memoryImages[0]).toEqual({
      url: "https://images.example.com/mai-01.jpg",
      alt: "Mai hồi nhỏ bên chiếc xe đạp",
      caption: "Chiếc xe đạp đầu tiên",
    });
    expect(result.memoryImages[1].alt).toBe("Ngày đầu đi học");
    expect(JSON.stringify(result)).not.toContain("javascript:");
  });

  it("sanitizes pixel quest config and falls back when checkpoints are unsafe", () => {
    const data = createDemoData();
    const chapter = data.chapters[0];
    chapter.metadata.pixelQuest = {
      version: 1,
      preset: "royal-memory-kingdom",
      worldWidthPx: 1800,
      startPosition: 80,
      noFailPath: true,
      zones: [
        { id: "one", title: "One", checkpointPosition: 480, npcLine: "Hello" },
        { id: "two", title: "Two", checkpointPosition: 400, npcLine: "Out of order" },
        { id: "three", title: "Three", checkpointPosition: 1520, npcLine: "Hello" },
      ],
    };

    expect(toPublicChapterDTO(chapter).pixelQuest).toEqual(DEFAULT_PIXEL_QUEST);

    chapter.metadata.pixelQuest = {
      ...DEFAULT_PIXEL_QUEST,
      zones: DEFAULT_PIXEL_QUEST.zones.map((zone, index) => ({
        ...zone,
        npcLine: `Safe NPC ${index + 1}`,
      })),
    };
    expect(toPublicChapterDTO(chapter).pixelQuest.zones[1].npcLine).toBe("Safe NPC 2");
  });

  it("records pixel quest events idempotently without advancing the chapter", async () => {
    const data = createDemoData();
    const repository = new DemoBirthdayRepository(data);
    const started = await repository.startSession(
      {
        campaignSlug: data.campaign.slug,
        recipientId: data.recipients[0].id,
        clientEventId: "quest-session-start",
      },
      context,
    );
    const input = {
      eventName: "pixel_quest_checkpoint" as const,
      chapterId: started.chapter.id,
      checkpointId: started.chapter.pixelQuest.zones[0].id,
      clientEventId: "pixel-checkpoint-1",
      moveCount: 5,
    };

    expect(await repository.trackPixelQuestEvent(started.token, input, context)).toEqual({
      accepted: true,
      duplicate: false,
    });
    expect(await repository.trackPixelQuestEvent(started.token, input, context)).toEqual({
      accepted: true,
      duplicate: true,
    });

    const events = (repository as unknown as { events: GameEvent[] }).events;
    expect(events.filter((event) => event.clientEventId === input.clientEventId)).toHaveLength(1);

    const choice = await repository.recordChoice(
      started.token,
      {
        chapterId: started.chapter.id,
        choiceKey: started.chapter.options[0].key,
        answerText: null,
        clientEventId: "choice-after-quest-event",
        elapsedMs: null,
      },
      context,
    );
    expect(choice.session.completedChapterCount).toBe(1);
  });

  it("rejects pixel events for a foreign chapter or unknown checkpoint", async () => {
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
    )!;

    await expect(repository.trackPixelQuestEvent(
      started.token,
      {
        eventName: "pixel_quest_started",
        chapterId: foreignChapter.id,
        checkpointId: null,
        clientEventId: "foreign-chapter",
        moveCount: 0,
      },
      context,
    )).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });

    await expect(repository.trackPixelQuestEvent(
      started.token,
      {
        eventName: "pixel_quest_checkpoint",
        chapterId: started.chapter.id,
        checkpointId: "unknown-zone",
        clientEventId: "unknown-checkpoint",
        moveCount: 1,
      },
      context,
    )).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("sanitizes child character metadata and provides safe fallbacks", async () => {
    const data = createDemoData();
    data.recipients[0].metadata.childCharacterName = "  Bé Mai Phiêu Lưu  ";
    data.recipients[0].metadata.childCharacterTrait = "x".repeat(300);
    data.recipients[0].metadata.childCharacterArchetype = "invalid-role";
    delete data.recipients[1].metadata.childCharacterName;
    delete data.recipients[1].metadata.childCharacterTrait;
    const repository = new DemoBirthdayRepository(data);

    const result = await repository.getPublicCampaign(data.campaign.slug, context);

    expect(result.campaign.recipients[0].childCharacter.name).toBe("Bé Mai Phiêu Lưu");
    expect(result.campaign.recipients[0].childCharacter.trait).toHaveLength(160);
    expect(result.campaign.recipients[0].childCharacter.archetype).toBe("princess");
    expect(result.campaign.recipients[1].childCharacter).toEqual({
      name: `Bé ${data.recipients[1].displayName}`,
      trait: "Tò mò, thích khám phá những điều thân quen",
      archetype: "prince",
    });
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
