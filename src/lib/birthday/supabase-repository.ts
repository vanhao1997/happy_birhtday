import { decryptSecret, encryptSecret, generateSessionToken, hashSessionToken } from "./crypto";
import { buildCampaignAnalytics } from "./analytics";
import {
  toPublicCampaignDTO,
  toPublicChapterDTO,
  toPublicRecipientDTO,
  toPublicSessionDTO,
  toVoucherRevealDTO,
} from "./dto";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import {
  eq,
  limit,
  order,
  select,
  SupabaseRestClient,
  type QueryParam,
} from "./supabase-rest";
import { bangkokDateKey, isWithinCampaignWindow, nowIso } from "./time";
import {
  REQUIRED_CHAPTER_COUNT,
  type AdminCampaignInput,
  type AdminCampaignAnalyticsResult,
  type AdminCampaignPatch,
  type AdminChapterInput,
  type AdminIdentity,
  type AdminRecipientInput,
  type AdminRecipientPatch,
  type AdminVoucherInput,
  type Campaign,
  type CampaignStatus,
  type Chapter,
  type ChapterOption,
  type Choice,
  type CompleteSessionResult,
  type GameSession,
  type JsonObject,
  type PublicCampaignResult,
  type Recipient,
  type RecipientStatus,
  type RecordChoiceInput,
  type RecordChoiceResult,
  type RequestContext,
  type SessionStatus,
  type StartSessionInput,
  type StartSessionResult,
  type TrackPixelQuestEventInput,
  type TrackPixelQuestEventResult,
  type Voucher,
} from "./types";
import type { BirthdayRepository } from "./repository";

interface CampaignRow {
  id: string;
  workspace_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  locale: string;
  timezone: string;
  status: CampaignStatus;
  starts_at: string | null;
  ends_at: string | null;
  theme: JsonObject | null;
  settings: JsonObject | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RecipientRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  slug: string;
  display_name: string;
  relation_label: string | null;
  birthday_date: string | null;
  avatar_url: string | null;
  status: RecipientStatus;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string;
  order_index: number;
  title: string;
  body: string;
  prompt: string;
  options: ChapterOption[] | null;
  media_asset_id: string | null;
  is_published: boolean;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

interface ChoiceRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string;
  session_id: string;
  chapter_id: string;
  choice_key: string;
  answer_text: string | null;
  client_event_id: string | null;
  elapsed_ms: number | null;
  metadata: JsonObject | null;
  created_at: string;
}

interface GameSessionRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string;
  token_hash: string;
  status: SessionStatus;
  current_chapter_order: number;
  completed_chapters: number;
  started_at: string;
  completed_at: string | null;
  voucher_revealed_at: string | null;
  last_seen_at: string;
  metadata: JsonObject | null;
}

interface VoucherRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string;
  code_ciphertext: string;
  code_hint: string | null;
  title: string;
  description: string | null;
  terms: string | null;
  revealed_at: string | null;
  expires_at: string | null;
  metadata: JsonObject | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string;
  chapter_id: string | null;
  sender_label: string;
  body: string;
  consent_status: "pending" | "approved" | "revoked";
  reveal_after_order: number;
  metadata: JsonObject | null;
  created_at: string;
}

interface GameEventRow {
  id: string;
  workspace_id: string;
  campaign_id: string;
  recipient_id: string | null;
  session_id: string | null;
  event_name: string;
  chapter_id: string | null;
  client_event_id: string | null;
  occurred_at: string;
  occurred_date_bkk: string;
  payload: JsonObject | null;
  request_ip_hash: string | null;
  user_agent: string | null;
}

export class SupabaseBirthdayRepository implements BirthdayRepository {
  readonly mode = "supabase" as const;

  private readonly client = new SupabaseRestClient();

  async getPublicCampaign(
    slug: string,
    context: RequestContext,
  ): Promise<PublicCampaignResult> {
    const campaign = await this.findCampaignBySlug(slug);
    if (!campaign || campaign.status !== "published") {
      throw notFound("Campaign not found");
    }

    if (!isWithinCampaignWindow(campaign.startsAt, campaign.endsAt)) {
      throw notFound("Campaign not found");
    }

    const recipients = await this.recipientsForCampaign(campaign.id, campaign.workspaceId);
    if (recipients.length < 2 || recipients.length > 5) {
      throw notFound("Campaign not found");
    }
    await this.trackEvent("campaign_viewed", {
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      recipientId: null,
      sessionId: null,
      chapterId: null,
      clientEventId: null,
      context,
      payload: { slug },
    });

    return {
      campaign: toPublicCampaignDTO(campaign, recipients, REQUIRED_CHAPTER_COUNT),
    };
  }

  async startSession(
    input: StartSessionInput,
    context: RequestContext,
  ): Promise<StartSessionResult> {
    const campaign = await this.findCampaignBySlug(input.campaignSlug);
    if (!campaign || campaign.status !== "published") {
      throw notFound("Campaign not found");
    }

    if (!isWithinCampaignWindow(campaign.startsAt, campaign.endsAt)) {
      throw notFound("Campaign not found");
    }

    const recipient = await this.findRecipient(input.recipientId, campaign.workspaceId);
    if (recipient.campaignId !== campaign.id || recipient.status !== "active") {
      throw notFound("Recipient not found for campaign");
    }

    const chapter = await this.chapterForOrder(campaign.id, recipient.id, 1);
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const timestamp = nowIso();
    const [sessionRow] = await this.client.table<GameSessionRow>(
      "game_sessions",
      [select("*")],
      {
        method: "POST",
        body: [
          {
            workspace_id: campaign.workspaceId,
            campaign_id: campaign.id,
            recipient_id: recipient.id,
            token_hash: tokenHash,
            status: "active",
            current_chapter_order: 1,
            completed_chapters: 0,
            started_at: timestamp,
            last_seen_at: timestamp,
            metadata: {},
          },
        ],
        prefer: "return=representation",
      },
    );

    if (!sessionRow) {
      throw conflict("Unable to create session");
    }

    const session = mapSession(sessionRow);
    await this.trackEvent("session_started", {
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      recipientId: recipient.id,
      sessionId: session.id,
      chapterId: null,
      clientEventId: input.clientEventId,
      context,
      payload: { campaignSlug: input.campaignSlug },
    });

    return {
      token,
      session: toPublicSessionDTO(session),
      recipient: toPublicRecipientDTO(recipient),
      chapter: toPublicChapterDTO(chapter),
    };
  }

  async recordChoice(
    token: string,
    input: RecordChoiceInput,
    context: RequestContext,
  ): Promise<RecordChoiceResult> {
    const session = await this.findSessionByToken(token);
    if (session.status !== "active") {
      throw conflict("Session is already completed");
    }

    const chapter = await this.findChapter(input.chapterId, session);
    const existingChoice = await this.findChoice(session.id, chapter.id);
    if (existingChoice) {
      const nextChapter = await this.nextChapter(session);
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

    const [choiceRow] = await this.client.table<ChoiceRow>("choices", [select("*")], {
      method: "POST",
      body: [
        {
          workspace_id: session.workspaceId,
          campaign_id: session.campaignId,
          recipient_id: session.recipientId,
          session_id: session.id,
          chapter_id: chapter.id,
          choice_key: input.choiceKey,
          answer_text: input.answerText,
          client_event_id: input.clientEventId,
          elapsed_ms: input.elapsedMs,
          metadata: {},
        },
      ],
      prefer: "return=representation",
    });

    if (!choiceRow) {
      throw conflict("Unable to record choice");
    }

    const completedChapters = Math.max(session.completedChapters, chapter.orderIndex);
    const timestamp = nowIso();
    const nextStatus: SessionStatus =
      completedChapters >= REQUIRED_CHAPTER_COUNT ? "completed" : "active";
    const [updatedSessionRow] = await this.client.table<GameSessionRow>(
      "game_sessions",
      [select("*"), eq("id", session.id), eq("workspace_id", session.workspaceId)],
      {
        method: "PATCH",
        body: {
          completed_chapters: completedChapters,
          current_chapter_order: completedChapters + 1,
          status: nextStatus,
          completed_at: nextStatus === "completed" ? timestamp : session.completedAt,
          last_seen_at: timestamp,
        },
        prefer: "return=representation",
      },
    );

    const updatedSession = updatedSessionRow ? mapSession(updatedSessionRow) : session;

    await this.trackEvent("choice_recorded", {
      workspaceId: session.workspaceId,
      campaignId: session.campaignId,
      recipientId: session.recipientId,
      sessionId: session.id,
      chapterId: chapter.id,
      clientEventId: input.clientEventId,
      context,
      payload: { choiceKey: input.choiceKey, elapsedMs: input.elapsedMs },
    });

    const nextChapter = await this.nextChapter(updatedSession);

    return {
      session: toPublicSessionDTO(updatedSession),
      acceptedChoice: {
        chapterId: chapter.id,
        choiceKey: input.choiceKey,
        response: selectedOption.response ?? null,
      },
      nextChapter: nextChapter ? toPublicChapterDTO(nextChapter) : null,
      completed: updatedSession.completedChapters >= REQUIRED_CHAPTER_COUNT,
    };
  }

  async completeSession(token: string, context: RequestContext): Promise<CompleteSessionResult> {
    const session = await this.findSessionByToken(token);
    if (session.completedChapters < REQUIRED_CHAPTER_COUNT) {
      throw conflict("Session has not completed all chapters", {
        completedChapters: session.completedChapters,
        requiredChapters: REQUIRED_CHAPTER_COUNT,
      });
    }

    const voucher = await this.voucherForRecipient(
      session.workspaceId,
      session.campaignId,
      session.recipientId,
    );
    if (voucher.expiresAt && Date.parse(voucher.expiresAt) <= Date.now()) {
      throw conflict("Voucher has expired");
    }
    const alreadyRevealed = Boolean(voucher.revealedAt);
    const revealedAt = voucher.revealedAt ?? nowIso();

    if (!voucher.revealedAt) {
      await this.client.table<VoucherRow>(
        "vouchers",
        [select("*"), eq("id", voucher.id), eq("workspace_id", voucher.workspaceId)],
        {
          method: "PATCH",
          body: {
            revealed_at: revealedAt,
            updated_at: revealedAt,
          },
          prefer: "return=representation",
        },
      );
    }

    const [updatedSessionRow] = await this.client.table<GameSessionRow>(
      "game_sessions",
      [select("*"), eq("id", session.id), eq("workspace_id", session.workspaceId)],
      {
        method: "PATCH",
        body: {
          status: "completed",
          completed_at: session.completedAt ?? revealedAt,
          voucher_revealed_at: session.voucherRevealedAt ?? revealedAt,
          last_seen_at: revealedAt,
        },
        prefer: "return=representation",
      },
    );

    const updatedSession = updatedSessionRow ? mapSession(updatedSessionRow) : session;
    await this.trackEvent("voucher_revealed", {
      workspaceId: session.workspaceId,
      campaignId: session.campaignId,
      recipientId: session.recipientId,
      sessionId: session.id,
      chapterId: null,
      clientEventId: null,
      context,
      payload: { alreadyRevealed },
    });

    return {
      session: toPublicSessionDTO(updatedSession),
      voucher: toVoucherRevealDTO(voucher, decryptSecret(voucher.codeCiphertext), revealedAt),
      alreadyRevealed,
    };
  }

  async trackPixelQuestEvent(
    token: string,
    input: TrackPixelQuestEventInput,
    context: RequestContext,
  ): Promise<TrackPixelQuestEventResult> {
    const session = await this.findSessionByToken(token);
    const chapter = await this.findChapter(input.chapterId, session);

    if (
      input.eventName === "pixel_quest_checkpoint"
      && !toPublicChapterDTO(chapter).pixelQuest.zones.some(
        (zone) => zone.id === input.checkpointId,
      )
    ) {
      throw conflict("checkpointId is not valid for this chapter");
    }

    const rows = await this.client.table<GameEventRow>(
      "game_events",
      [select("*"), ["on_conflict", "session_id,client_event_id"]],
      {
        method: "POST",
        body: [
          {
            workspace_id: session.workspaceId,
            campaign_id: session.campaignId,
            recipient_id: session.recipientId,
            session_id: session.id,
            event_name: input.eventName,
            chapter_id: chapter.id,
            client_event_id: input.clientEventId,
            occurred_date_bkk: bangkokDateKey(),
            payload: {
              checkpointId: input.checkpointId,
              moveCount: input.moveCount,
            },
            request_ip_hash: context.ipHash,
            user_agent: context.userAgent,
          },
        ],
        prefer: "resolution=ignore-duplicates,return=representation",
      },
    );

    return { accepted: true, duplicate: rows.length === 0 };
  }

  async listAdminCampaigns(auth: AdminIdentity): Promise<Campaign[]> {
    const rows = await this.client.table<CampaignRow>("campaigns", [
      select("*"),
      eq("workspace_id", auth.workspaceId),
      order("created_at", false),
    ]);

    return rows.map(mapCampaign);
  }

  async createAdminCampaign(
    auth: AdminIdentity,
    input: AdminCampaignInput,
  ): Promise<Campaign> {
    if (input.status === "published") {
      throw badRequest("Create the campaign as draft, add 2-5 recipients, then publish it");
    }

    const [row] = await this.client.table<CampaignRow>("campaigns", [select("*")], {
      method: "POST",
      body: [
        {
          workspace_id: auth.workspaceId,
          slug: input.slug,
          title: input.title,
          subtitle: input.subtitle,
          locale: input.locale,
          timezone: input.timezone,
          status: input.status,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          theme: input.theme,
          settings: input.settings,
          created_by: auth.userId,
        },
      ],
      prefer: "return=representation",
    });

    if (!row) {
      throw conflict("Unable to create campaign");
    }

    const campaign = mapCampaign(row);
    await this.audit(auth, "campaign.created", "campaign", campaign.id, null, campaign);
    return campaign;
  }

  async getAdminCampaign(auth: AdminIdentity, campaignId: string): Promise<Campaign> {
    return this.findCampaign(campaignId, auth.workspaceId);
  }

  async getAdminCampaignAnalytics(
    auth: AdminIdentity,
    campaignId: string,
  ): Promise<AdminCampaignAnalyticsResult> {
    const campaign = await this.findCampaign(campaignId, auth.workspaceId);
    const [recipients, sessionRows, eventRows] = await Promise.all([
      this.recipientsForCampaign(campaignId, auth.workspaceId),
      this.client.table<GameSessionRow>("game_sessions", [
        select("*"),
        eq("workspace_id", auth.workspaceId),
        eq("campaign_id", campaignId),
        order("started_at", false),
      ]),
      this.client.table<GameEventRow>("game_events", [
        select("*"),
        eq("workspace_id", auth.workspaceId),
        eq("campaign_id", campaignId),
      ]),
    ]);

    return buildCampaignAnalytics({
      campaignId,
      timezone: campaign.timezone,
      recipients,
      sessions: sessionRows.map(mapSession),
      events: eventRows.map((event) => ({
        eventName: event.event_name,
        sessionId: event.session_id,
      })),
    });
  }

  async updateAdminCampaign(
    auth: AdminIdentity,
    campaignId: string,
    patch: AdminCampaignPatch,
  ): Promise<Campaign> {
    const before = await this.findCampaign(campaignId, auth.workspaceId);
    if (patch.status === "published" && before.status !== "published") {
      await this.assertCampaignPublishable(before);
    }
    const [row] = await this.client.table<CampaignRow>(
      "campaigns",
      [select("*"), eq("id", campaignId), eq("workspace_id", auth.workspaceId)],
      {
        method: "PATCH",
        body: campaignPatchToRow(patch),
        prefer: "return=representation",
      },
    );

    if (!row) {
      throw notFound("Campaign not found");
    }

    const after = mapCampaign(row);
    await this.audit(auth, "campaign.updated", "campaign", campaignId, before, after);
    return after;
  }

  async deleteAdminCampaign(auth: AdminIdentity, campaignId: string): Promise<{ deleted: true }> {
    const before = await this.findCampaign(campaignId, auth.workspaceId);
    await this.client.table<CampaignRow>(
      "campaigns",
      [eq("id", campaignId), eq("workspace_id", auth.workspaceId)],
      {
        method: "DELETE",
        prefer: "return=minimal",
      },
    );

    await this.audit(auth, "campaign.deleted", "campaign", campaignId, before, null);
    return { deleted: true };
  }

  async listAdminRecipients(auth: AdminIdentity, campaignId: string): Promise<Recipient[]> {
    await this.findCampaign(campaignId, auth.workspaceId);
    const rows = await this.client.table<RecipientRow>("recipients", [
      select("*"),
      eq("workspace_id", auth.workspaceId),
      eq("campaign_id", campaignId),
      order("display_name"),
    ]);

    return rows.map(mapRecipient);
  }

  async createAdminRecipient(
    auth: AdminIdentity,
    campaignId: string,
    input: AdminRecipientInput,
  ): Promise<Recipient> {
    const campaign = await this.findCampaign(campaignId, auth.workspaceId);
    const [row] = await this.client.table<RecipientRow>("recipients", [select("*")], {
      method: "POST",
      body: [
        {
          workspace_id: auth.workspaceId,
          campaign_id: campaign.id,
          slug: input.slug,
          display_name: input.displayName,
          relation_label: input.relationLabel,
          birthday_date: input.birthdayDate,
          avatar_url: input.avatarUrl,
          status: input.status,
          metadata: input.metadata,
        },
      ],
      prefer: "return=representation",
    });

    if (!row) {
      throw conflict("Unable to create recipient");
    }

    const recipient = mapRecipient(row);
    await this.replaceChapters(auth, recipient, input.chapters);
    await this.replaceMessages(auth, recipient, input.messages);
    if (input.voucher) {
      await this.writeVoucher(auth, recipient, input.voucher);
    }

    await this.audit(auth, "recipient.created", "recipient", recipient.id, null, recipient);
    return recipient;
  }

  async updateAdminRecipient(
    auth: AdminIdentity,
    recipientId: string,
    patch: AdminRecipientPatch,
  ): Promise<Recipient> {
    const before = await this.findRecipient(recipientId, auth.workspaceId);
    const [row] = await this.client.table<RecipientRow>(
      "recipients",
      [select("*"), eq("id", recipientId), eq("workspace_id", auth.workspaceId)],
      {
        method: "PATCH",
        body: recipientPatchToRow(patch),
        prefer: "return=representation",
      },
    );

    if (!row) {
      throw notFound("Recipient not found");
    }

    const after = mapRecipient(row);
    await this.audit(auth, "recipient.updated", "recipient", recipientId, before, after);
    return after;
  }

  async deleteAdminRecipient(auth: AdminIdentity, recipientId: string): Promise<{ deleted: true }> {
    const before = await this.findRecipient(recipientId, auth.workspaceId);
    await this.client.table<RecipientRow>(
      "recipients",
      [eq("id", recipientId), eq("workspace_id", auth.workspaceId)],
      {
        method: "DELETE",
        prefer: "return=minimal",
      },
    );

    await this.audit(auth, "recipient.deleted", "recipient", recipientId, before, null);
    return { deleted: true };
  }

  async upsertAdminChapters(
    auth: AdminIdentity,
    recipientId: string,
    chapters: AdminChapterInput[],
  ): Promise<{ count: number }> {
    const recipient = await this.findRecipient(recipientId, auth.workspaceId);
    const result = await this.replaceChapters(auth, recipient, chapters);
    await this.audit(auth, "chapters.replaced", "recipient", recipientId, null, {
      count: result.count,
    });
    return result;
  }

  async upsertAdminVoucher(
    auth: AdminIdentity,
    recipientId: string,
    voucher: AdminVoucherInput,
  ): Promise<Voucher> {
    const recipient = await this.findRecipient(recipientId, auth.workspaceId);
    const written = await this.writeVoucher(auth, recipient, voucher);
    await this.audit(auth, "voucher.upserted", "recipient", recipientId, null, {
      id: written.id,
      title: written.title,
      codeHint: written.codeHint,
    });
    return written;
  }

  private async findCampaignBySlug(slug: string): Promise<Campaign | null> {
    const rows = await this.client.table<CampaignRow>("campaigns", [
      select("*"),
      eq("slug", slug),
      limit(1),
    ]);

    return rows[0] ? mapCampaign(rows[0]) : null;
  }

  private async findCampaign(campaignId: string, workspaceId: string): Promise<Campaign> {
    const rows = await this.client.table<CampaignRow>("campaigns", [
      select("*"),
      eq("id", campaignId),
      eq("workspace_id", workspaceId),
      limit(1),
    ]);

    if (!rows[0]) {
      throw notFound("Campaign not found");
    }

    return mapCampaign(rows[0]);
  }

  private async recipientsForCampaign(campaignId: string, workspaceId: string): Promise<Recipient[]> {
    const rows = await this.client.table<RecipientRow>("recipients", [
      select("*"),
      eq("workspace_id", workspaceId),
      eq("campaign_id", campaignId),
      eq("status", "active"),
      order("display_name"),
    ]);

    return rows.map(mapRecipient);
  }

  private async findRecipient(recipientId: string, workspaceId: string): Promise<Recipient> {
    const rows = await this.client.table<RecipientRow>("recipients", [
      select("*"),
      eq("id", recipientId),
      eq("workspace_id", workspaceId),
      limit(1),
    ]);

    if (!rows[0]) {
      throw notFound("Recipient not found");
    }

    return mapRecipient(rows[0]);
  }

  private async chapterForOrder(
    campaignId: string,
    recipientId: string,
    orderIndex: number,
  ): Promise<Chapter> {
    const rows = await this.client.table<ChapterRow>("chapters", [
      select("*"),
      eq("campaign_id", campaignId),
      eq("recipient_id", recipientId),
      eq("order_index", orderIndex),
      eq("is_published", true),
      limit(1),
    ]);

    if (!rows[0]) {
      throw notFound("Chapter not found");
    }

    return mapChapter(rows[0]);
  }

  private async findChapter(chapterId: string, session: GameSession): Promise<Chapter> {
    const rows = await this.client.table<ChapterRow>("chapters", [
      select("*"),
      eq("id", chapterId),
      eq("workspace_id", session.workspaceId),
      eq("campaign_id", session.campaignId),
      eq("recipient_id", session.recipientId),
      eq("is_published", true),
      limit(1),
    ]);

    if (!rows[0]) {
      throw notFound("Chapter not found for session");
    }

    return mapChapter(rows[0]);
  }

  private async findSessionByToken(token: string): Promise<GameSession> {
    const rows = await this.client.table<GameSessionRow>("game_sessions", [
      select("*"),
      eq("token_hash", hashSessionToken(token)),
      limit(1),
    ]);

    if (!rows[0]) {
      throw forbidden("Invalid session token");
    }

    return mapSession(rows[0]);
  }

  private async findChoice(sessionId: string, chapterId: string): Promise<Choice | null> {
    const rows = await this.client.table<ChoiceRow>("choices", [
      select("*"),
      eq("session_id", sessionId),
      eq("chapter_id", chapterId),
      limit(1),
    ]);

    return rows[0] ? mapChoice(rows[0]) : null;
  }

  private async nextChapter(session: GameSession): Promise<Chapter | null> {
    if (session.completedChapters >= REQUIRED_CHAPTER_COUNT) {
      return null;
    }

    return this.chapterForOrder(
      session.campaignId,
      session.recipientId,
      session.currentChapterOrder,
    );
  }

  private async voucherForRecipient(
    workspaceId: string,
    campaignId: string,
    recipientId: string,
  ): Promise<Voucher> {
    const rows = await this.client.table<VoucherRow>("vouchers", [
      select("*"),
      eq("workspace_id", workspaceId),
      eq("campaign_id", campaignId),
      eq("recipient_id", recipientId),
      limit(1),
    ]);

    if (!rows[0]) {
      throw notFound("Voucher not found for recipient");
    }

    return mapVoucher(rows[0]);
  }

  private async replaceChapters(
    auth: AdminIdentity,
    recipient: Recipient,
    chapters: AdminChapterInput[],
  ): Promise<{ count: number }> {
    await this.client.table<ChapterRow>(
      "chapters",
      [eq("workspace_id", auth.workspaceId), eq("recipient_id", recipient.id)],
      {
        method: "DELETE",
        prefer: "return=minimal",
      },
    );

    await this.client.table<ChapterRow>("chapters", [], {
      method: "POST",
      body: chapters.map((chapter) => ({
        workspace_id: auth.workspaceId,
        campaign_id: recipient.campaignId,
        recipient_id: recipient.id,
        order_index: chapter.orderIndex,
        title: chapter.title,
        body: chapter.body,
        prompt: chapter.prompt,
        options: chapter.options,
        is_published: chapter.isPublished,
        metadata: chapter.metadata,
      })),
      prefer: "return=minimal",
    });

    return { count: chapters.length };
  }

  private async replaceMessages(
    auth: AdminIdentity,
    recipient: Recipient,
    messages: AdminRecipientInput["messages"],
  ): Promise<void> {
    await this.client.table<MessageRow>(
      "messages",
      [eq("workspace_id", auth.workspaceId), eq("recipient_id", recipient.id)],
      {
        method: "DELETE",
        prefer: "return=minimal",
      },
    );

    if (messages.length === 0) {
      return;
    }

    await this.client.table<MessageRow>("messages", [], {
      method: "POST",
      body: messages.map((message) => ({
        workspace_id: auth.workspaceId,
        campaign_id: recipient.campaignId,
        recipient_id: recipient.id,
        sender_label: message.senderLabel,
        body: message.body,
        consent_status: message.consentStatus,
        reveal_after_order: message.revealAfterOrder,
        metadata: message.metadata,
      })),
      prefer: "return=minimal",
    });
  }

  private async assertCampaignPublishable(campaign: Campaign): Promise<void> {
    const recipients = await this.recipientsForCampaign(campaign.id, campaign.workspaceId);
    if (recipients.length < 2 || recipients.length > 5) {
      throw conflict("Published campaigns require 2-5 active recipients", {
        activeRecipients: recipients.length,
      });
    }

    const [chapters, vouchers] = await Promise.all([
      this.client.table<Pick<ChapterRow, "recipient_id" | "order_index">>("chapters", [
        select("recipient_id,order_index"),
        eq("workspace_id", campaign.workspaceId),
        eq("campaign_id", campaign.id),
        eq("is_published", true),
      ]),
      this.client.table<Pick<VoucherRow, "recipient_id">>("vouchers", [
        select("recipient_id"),
        eq("workspace_id", campaign.workspaceId),
        eq("campaign_id", campaign.id),
      ]),
    ]);

    const voucherRecipientIds = new Set(vouchers.map((voucher) => voucher.recipient_id));
    for (const recipient of recipients) {
      const chapterOrders = new Set(
        chapters
          .filter((chapter) => chapter.recipient_id === recipient.id)
          .map((chapter) => chapter.order_index),
      );

      if (chapterOrders.size !== REQUIRED_CHAPTER_COUNT || !voucherRecipientIds.has(recipient.id)) {
        throw conflict("Every active recipient needs four published chapters and one voucher", {
          recipientId: recipient.id,
          chapterCount: chapterOrders.size,
          hasVoucher: voucherRecipientIds.has(recipient.id),
        });
      }
    }
  }

  private async writeVoucher(
    auth: AdminIdentity,
    recipient: Recipient,
    voucher: AdminVoucherInput,
  ): Promise<Voucher> {
    const existing = await this.client.table<VoucherRow>("vouchers", [
      select("*"),
      eq("workspace_id", auth.workspaceId),
      eq("recipient_id", recipient.id),
      limit(1),
    ]);

    const body = {
      workspace_id: auth.workspaceId,
      campaign_id: recipient.campaignId,
      recipient_id: recipient.id,
      code_ciphertext: encryptSecret(voucher.code),
      code_hint: voucher.codeHint,
      title: voucher.title,
      description: voucher.description,
      terms: voucher.terms,
      expires_at: voucher.expiresAt,
      metadata: voucher.metadata,
      updated_at: nowIso(),
    };

    const params: QueryParam[] = existing[0]
      ? [select("*"), eq("id", existing[0].id), eq("workspace_id", auth.workspaceId)]
      : [select("*")];

    const [row] = await this.client.table<VoucherRow>("vouchers", params, {
      method: existing[0] ? "PATCH" : "POST",
      body: existing[0] ? body : [body],
      prefer: "return=representation",
    });

    if (!row) {
      throw conflict("Unable to write voucher");
    }

    return mapVoucher(row);
  }

  private async trackEvent(eventName: string, args: {
    workspaceId: string;
    campaignId: string;
    recipientId: string | null;
    sessionId: string | null;
    chapterId: string | null;
    clientEventId: string | null;
    context: RequestContext;
    payload: JsonObject;
  }): Promise<void> {
    try {
      await this.client.table("game_events", [], {
        method: "POST",
        body: [
          {
            workspace_id: args.workspaceId,
            campaign_id: args.campaignId,
            recipient_id: args.recipientId,
            session_id: args.sessionId,
            event_name: eventName,
            chapter_id: args.chapterId,
            client_event_id: args.clientEventId,
            occurred_date_bkk: bangkokDateKey(),
            payload: args.payload,
            request_ip_hash: args.context.ipHash,
            user_agent: args.context.userAgent,
          },
        ],
        prefer: "return=minimal",
      });
    } catch (error) {
      console.error("[birthday-events]", error);
    }
  }

  private async audit(
    auth: AdminIdentity,
    action: string,
    entityType: string,
    entityId: string | null,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<void> {
    await this.client.table("audit_logs", [], {
      method: "POST",
      body: [
        {
          workspace_id: auth.workspaceId,
          actor_user_id: auth.userId,
          actor_email: auth.email,
          action,
          entity_type: entityType,
          entity_id: entityId,
          before_data: beforeData,
          after_data: afterData,
        },
      ],
      prefer: "return=minimal",
    });
  }
}

function mapCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    locale: row.locale,
    timezone: row.timezone,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    theme: row.theme ?? {},
    settings: row.settings ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRecipient(row: RecipientRow): Recipient {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    slug: row.slug,
    displayName: row.display_name,
    relationLabel: row.relation_label,
    birthdayDate: row.birthday_date,
    avatarUrl: row.avatar_url,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    recipientId: row.recipient_id,
    orderIndex: row.order_index,
    title: row.title,
    body: row.body,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? row.options : [],
    mediaAssetId: row.media_asset_id,
    isPublished: row.is_published,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChoice(row: ChoiceRow): Choice {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    recipientId: row.recipient_id,
    sessionId: row.session_id,
    chapterId: row.chapter_id,
    choiceKey: row.choice_key,
    answerText: row.answer_text,
    clientEventId: row.client_event_id,
    elapsedMs: row.elapsed_ms,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

function mapSession(row: GameSessionRow): GameSession {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    recipientId: row.recipient_id,
    tokenHash: row.token_hash,
    status: row.status,
    currentChapterOrder: row.current_chapter_order,
    completedChapters: row.completed_chapters,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    voucherRevealedAt: row.voucher_revealed_at,
    lastSeenAt: row.last_seen_at,
    metadata: row.metadata ?? {},
  };
}

function mapVoucher(row: VoucherRow): Voucher {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    campaignId: row.campaign_id,
    recipientId: row.recipient_id,
    codeCiphertext: row.code_ciphertext,
    codeHint: row.code_hint,
    title: row.title,
    description: row.description,
    terms: row.terms,
    revealedAt: row.revealed_at,
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function campaignPatchToRow(patch: AdminCampaignPatch): Record<string, unknown> {
  const body: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.slug !== undefined) body.slug = patch.slug;
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.subtitle !== undefined) body.subtitle = patch.subtitle;
  if (patch.locale !== undefined) body.locale = patch.locale;
  if (patch.timezone !== undefined) body.timezone = patch.timezone;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.theme !== undefined) body.theme = patch.theme;
  if (patch.settings !== undefined) body.settings = patch.settings;
  if (patch.startsAt !== undefined) body.starts_at = patch.startsAt;
  if (patch.endsAt !== undefined) body.ends_at = patch.endsAt;
  return body;
}

function recipientPatchToRow(patch: AdminRecipientPatch): Record<string, unknown> {
  const body: Record<string, unknown> = { updated_at: nowIso() };
  if (patch.slug !== undefined) body.slug = patch.slug;
  if (patch.displayName !== undefined) body.display_name = patch.displayName;
  if (patch.relationLabel !== undefined) body.relation_label = patch.relationLabel;
  if (patch.birthdayDate !== undefined) body.birthday_date = patch.birthdayDate;
  if (patch.avatarUrl !== undefined) body.avatar_url = patch.avatarUrl;
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.metadata !== undefined) body.metadata = patch.metadata;
  return body;
}
