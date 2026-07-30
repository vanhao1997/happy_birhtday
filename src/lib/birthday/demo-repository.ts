import { randomUUID } from "crypto";
import { decryptSecret, generateSessionToken, hashSessionToken } from "./crypto";
import { createDemoData, type DemoData } from "./demo-data";
import {
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from "./errors";
import { bangkokDateKey, isWithinCampaignWindow, nowIso } from "./time";
import {
  REQUIRED_CHAPTER_COUNT,
  type Choice,
  type CompleteSessionResult,
  type GameEvent,
  type GameSession,
  type JsonObject,
  type PublicCampaignResult,
  type RecordChoiceInput,
  type RecordChoiceResult,
  type RequestContext,
  type StartSessionInput,
  type StartSessionResult,
} from "./types";
import {
  toPublicCampaignDTO,
  toPublicChapterDTO,
  toPublicRecipientDTO,
  toPublicSessionDTO,
  toVoucherRevealDTO,
} from "./dto";
import type { BirthdayRepository } from "./repository";

export class DemoBirthdayRepository implements BirthdayRepository {
  readonly mode = "demo" as const;

  private readonly data: DemoData;
  private readonly sessionsByHash = new Map<string, GameSession>();
  private readonly choicesBySessionId = new Map<string, Choice[]>();
  private readonly events: GameEvent[] = [];

  constructor(data = createDemoData()) {
    this.data = data;
  }

  async getPublicCampaign(slug: string, context: RequestContext): Promise<PublicCampaignResult> {
    const campaign = this.data.campaign.slug === slug ? this.data.campaign : null;
    if (!campaign || campaign.status !== "published") {
      throw notFound("Campaign not found");
    }

    if (!isWithinCampaignWindow(campaign.startsAt, campaign.endsAt)) {
      throw notFound("Campaign not found");
    }

    const recipients = this.data.recipients.filter(
      (recipient) => recipient.campaignId === campaign.id && recipient.status === "active",
    );
    if (recipients.length < 2 || recipients.length > 5) {
      throw notFound("Campaign not found");
    }

    this.trackEvent("campaign_viewed", null, null, null, context, { slug });

    return {
      campaign: toPublicCampaignDTO(campaign, recipients, REQUIRED_CHAPTER_COUNT),
    };
  }

  async startSession(
    input: StartSessionInput,
    context: RequestContext,
  ): Promise<StartSessionResult> {
    const campaign = this.data.campaign.slug === input.campaignSlug ? this.data.campaign : null;
    if (!campaign || campaign.status !== "published") {
      throw notFound("Campaign not found");
    }

    if (!isWithinCampaignWindow(campaign.startsAt, campaign.endsAt)) {
      throw notFound("Campaign not found");
    }

    const recipient = this.data.recipients.find(
      (item) =>
        item.id === input.recipientId &&
        item.campaignId === campaign.id &&
        item.workspaceId === campaign.workspaceId &&
        item.status === "active",
    );

    if (!recipient) {
      throw notFound("Recipient not found for campaign");
    }

    const firstChapter = this.chapterForOrder(campaign.id, recipient.id, 1);
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const timestamp = nowIso();
    const session: GameSession = {
      id: randomUUID(),
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      tokenHash,
      status: "active",
      currentChapterOrder: 1,
      completedChapters: 0,
      startedAt: timestamp,
      completedAt: null,
      voucherRevealedAt: null,
      lastSeenAt: timestamp,
      metadata: {},
    };

    this.sessionsByHash.set(tokenHash, session);
    this.choicesBySessionId.set(session.id, []);
    this.trackEvent(
      "session_started",
      session,
      null,
      input.clientEventId,
      context,
      { campaignSlug: input.campaignSlug },
    );

    return {
      token,
      session: toPublicSessionDTO(session),
      recipient: toPublicRecipientDTO(recipient),
      chapter: toPublicChapterDTO(firstChapter),
    };
  }

  async recordChoice(
    token: string,
    input: RecordChoiceInput,
    context: RequestContext,
  ): Promise<RecordChoiceResult> {
    const session = this.findSessionByToken(token);
    if (session.status !== "active") {
      throw conflict("Session is already completed");
    }

    const chapter = this.data.chapters.find(
      (item) =>
        item.id === input.chapterId &&
        item.workspaceId === session.workspaceId &&
        item.campaignId === session.campaignId &&
        item.recipientId === session.recipientId &&
        item.isPublished,
    );

    if (!chapter) {
      throw notFound("Chapter not found for session");
    }

    const existingChoice = this.sessionChoices(session.id).find(
      (choice) => choice.chapterId === chapter.id,
    );

    if (existingChoice) {
      const nextChapter = this.nextChapter(session);
      return {
        session: toPublicSessionDTO(session),
        acceptedChoice: {
          chapterId: existingChoice.chapterId,
          choiceKey: existingChoice.choiceKey,
          response: chapter.options.find((option) => option.key === existingChoice.choiceKey)
            ?.response ?? null,
        },
        nextChapter: nextChapter ? toPublicChapterDTO(nextChapter) : null,
        completed: session.completedChapters >= REQUIRED_CHAPTER_COUNT,
      };
    }

    if (chapter.orderIndex !== session.currentChapterOrder) {
      throw conflict("Chapter is not the active session chapter", {
        currentChapterOrder: session.currentChapterOrder,
      });
    }

    const selectedOption = chapter.options.find((option) => option.key === input.choiceKey);
    if (!selectedOption) {
      throw conflict("choiceKey is not valid for this chapter");
    }

    const choice: Choice = {
      id: randomUUID(),
      workspaceId: session.workspaceId,
      campaignId: session.campaignId,
      recipientId: session.recipientId,
      sessionId: session.id,
      chapterId: chapter.id,
      choiceKey: input.choiceKey,
      answerText: input.answerText,
      clientEventId: input.clientEventId,
      elapsedMs: input.elapsedMs,
      metadata: {},
      createdAt: nowIso(),
    };

    this.sessionChoices(session.id).push(choice);

    const completedChapters = Math.max(session.completedChapters, chapter.orderIndex);
    session.completedChapters = completedChapters;
    session.currentChapterOrder = completedChapters + 1;
    session.lastSeenAt = nowIso();

    if (completedChapters >= REQUIRED_CHAPTER_COUNT) {
      session.status = "completed";
      session.completedAt = session.completedAt ?? nowIso();
    }

    this.trackEvent(
      "choice_recorded",
      session,
      chapter.id,
      input.clientEventId,
      context,
      { choiceKey: input.choiceKey, elapsedMs: input.elapsedMs },
    );

    const nextChapter = this.nextChapter(session);

    return {
      session: toPublicSessionDTO(session),
      acceptedChoice: {
        chapterId: chapter.id,
        choiceKey: input.choiceKey,
        response: selectedOption.response ?? null,
      },
      nextChapter: nextChapter ? toPublicChapterDTO(nextChapter) : null,
      completed: session.completedChapters >= REQUIRED_CHAPTER_COUNT,
    };
  }

  async completeSession(token: string, context: RequestContext): Promise<CompleteSessionResult> {
    const session = this.findSessionByToken(token);
    if (session.completedChapters < REQUIRED_CHAPTER_COUNT) {
      throw conflict("Session has not completed all chapters", {
        completedChapters: session.completedChapters,
        requiredChapters: REQUIRED_CHAPTER_COUNT,
      });
    }

    const voucher = this.data.vouchers.find(
      (item) =>
        item.workspaceId === session.workspaceId &&
        item.campaignId === session.campaignId &&
        item.recipientId === session.recipientId,
    );

    if (!voucher) {
      throw notFound("Voucher not found for recipient");
    }

    if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now()) {
      throw conflict("Voucher has expired");
    }

    const alreadyRevealed = Boolean(voucher.revealedAt);
    const revealedAt = voucher.revealedAt ?? nowIso();
    voucher.revealedAt = revealedAt;
    voucher.updatedAt = revealedAt;
    session.status = "completed";
    session.completedAt = session.completedAt ?? revealedAt;
    session.voucherRevealedAt = session.voucherRevealedAt ?? revealedAt;
    session.lastSeenAt = revealedAt;

    this.trackEvent("voucher_revealed", session, null, null, context, {
      alreadyRevealed,
    });

    return {
      session: toPublicSessionDTO(session),
      voucher: toVoucherRevealDTO(voucher, decryptSecret(voucher.codeCiphertext), revealedAt),
      alreadyRevealed,
    };
  }

  async listAdminCampaigns(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async createAdminCampaign(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async getAdminCampaign(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async getAdminCampaignAnalytics(): Promise<never> {
    throw serviceUnavailable("Admin analytics requires Supabase persistence and auth");
  }

  async updateAdminCampaign(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async deleteAdminCampaign(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async listAdminRecipients(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async createAdminRecipient(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async updateAdminRecipient(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async deleteAdminRecipient(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async upsertAdminChapters(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  async upsertAdminVoucher(): Promise<never> {
    throw serviceUnavailable("Admin CRUD requires Supabase persistence and auth");
  }

  private findSessionByToken(token: string): GameSession {
    const session = this.sessionsByHash.get(hashSessionToken(token));
    if (!session) {
      throw forbidden("Invalid session token");
    }

    return session;
  }

  private chapterForOrder(campaignId: string, recipientId: string, orderIndex: number) {
    const chapter = this.data.chapters.find(
      (item) =>
        item.campaignId === campaignId &&
        item.recipientId === recipientId &&
        item.orderIndex === orderIndex &&
        item.isPublished,
    );

    if (!chapter) {
      throw notFound("Chapter not found");
    }

    return chapter;
  }

  private nextChapter(session: GameSession) {
    if (session.completedChapters >= REQUIRED_CHAPTER_COUNT) {
      return null;
    }

    return this.chapterForOrder(
      session.campaignId,
      session.recipientId,
      session.currentChapterOrder,
    );
  }

  private sessionChoices(sessionId: string): Choice[] {
    const choices = this.choicesBySessionId.get(sessionId);
    if (!choices) {
      const empty: Choice[] = [];
      this.choicesBySessionId.set(sessionId, empty);
      return empty;
    }

    return choices;
  }

  private trackEvent(
    eventName: string,
    session: GameSession | null,
    chapterId: string | null,
    clientEventId: string | null,
    context: RequestContext,
    payload: JsonObject,
  ): void {
    this.events.push({
      id: randomUUID(),
      workspaceId: session?.workspaceId ?? this.data.workspace.id,
      campaignId: session?.campaignId ?? this.data.campaign.id,
      recipientId: session?.recipientId ?? null,
      sessionId: session?.id ?? null,
      eventName,
      chapterId,
      clientEventId,
      occurredAt: nowIso(),
      occurredDateBkk: bangkokDateKey(),
      payload,
      requestIpHash: context.ipHash,
      userAgent: context.userAgent,
    });
  }
}
