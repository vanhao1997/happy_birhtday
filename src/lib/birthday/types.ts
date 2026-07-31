export const REQUIRED_CHAPTER_COUNT = 4 as const;
export const APP_TIMEZONE = "Asia/Bangkok" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type CampaignStatus = "draft" | "published" | "archived";
export type RecipientStatus = "active" | "hidden" | "archived";
export type SessionStatus = "active" | "completed" | "abandoned";
export type AdminRole = "owner" | "admin" | "editor" | "viewer";
export type MessageConsentStatus = "pending" | "approved" | "revoked";
export const PIXEL_CHARACTER_ARCHETYPES = [
  "princess",
  "prince",
  "emperor",
  "knight",
] as const;
export type PixelCharacterArchetype = (typeof PIXEL_CHARACTER_ARCHETYPES)[number];
export const PIXEL_MEMORY_SCENES = [
  "childhood-home",
  "summer-playground",
  "old-classroom",
  "dream-road",
  "new-age-gate",
] as const;
export type PixelMemoryScene = (typeof PIXEL_MEMORY_SCENES)[number];
export const PIXEL_QUEST_EVENT_NAMES = [
  "pixel_quest_started",
  "pixel_quest_checkpoint",
  "pixel_quest_completed",
] as const;
export type PixelQuestEventName = (typeof PIXEL_QUEST_EVENT_NAMES)[number];

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  billingPlan: string;
  billingStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMember {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  role: AdminRole;
  createdAt: string;
}

export interface Campaign {
  id: string;
  workspaceId: string;
  slug: string;
  title: string;
  subtitle: string | null;
  locale: string;
  timezone: typeof APP_TIMEZONE | string;
  status: CampaignStatus;
  startsAt: string | null;
  endsAt: string | null;
  theme: JsonObject;
  settings: JsonObject;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Recipient {
  id: string;
  workspaceId: string;
  campaignId: string;
  slug: string;
  displayName: string;
  relationLabel: string | null;
  birthdayDate: string | null;
  avatarUrl: string | null;
  status: RecipientStatus;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterOption {
  key: string;
  label: string;
  response?: string;
  isCorrect?: boolean;
  metadata?: JsonObject;
}

export const CHAPTER_GAME_TYPES = [
  "memory_piece",
  "detail_hunt",
  "message_unlock",
  "story_branch",
] as const;

export type ChapterGameType = (typeof CHAPTER_GAME_TYPES)[number];

export interface Chapter {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string;
  orderIndex: number;
  title: string;
  body: string;
  prompt: string;
  options: ChapterOption[];
  mediaAssetId: string | null;
  isPublished: boolean;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface Choice {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string;
  sessionId: string;
  chapterId: string;
  choiceKey: string;
  answerText: string | null;
  clientEventId: string | null;
  elapsedMs: number | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface Message {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string;
  chapterId: string | null;
  senderLabel: string;
  body: string;
  consentStatus: MessageConsentStatus;
  revealAfterOrder: number;
  metadata: JsonObject;
  createdAt: string;
}

export interface GameSession {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string;
  tokenHash: string;
  status: SessionStatus;
  currentChapterOrder: number;
  completedChapters: number;
  startedAt: string;
  completedAt: string | null;
  voucherRevealedAt: string | null;
  lastSeenAt: string;
  metadata: JsonObject;
}

export interface GameEvent {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string | null;
  sessionId: string | null;
  eventName: string;
  chapterId: string | null;
  clientEventId: string | null;
  occurredAt: string;
  occurredDateBkk: string;
  payload: JsonObject;
  requestIpHash: string | null;
  userAgent: string | null;
}

export interface Voucher {
  id: string;
  workspaceId: string;
  campaignId: string;
  recipientId: string;
  codeCiphertext: string;
  codeHint: string | null;
  title: string;
  description: string | null;
  terms: string | null;
  revealedAt: string | null;
  expiresAt: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAsset {
  id: string;
  workspaceId: string;
  campaignId: string | null;
  recipientId: string | null;
  kind: string;
  storagePath: string | null;
  url: string | null;
  altText: string | null;
  width: number | null;
  height: number | null;
  metadata: JsonObject;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  workspaceId: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeData: JsonObject | null;
  afterData: JsonObject | null;
  ipHash: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface PublicRecipientDTO {
  id: string;
  slug: string;
  displayName: string;
  relationLabel: string | null;
  avatarUrl: string | null;
  accent: "pear" | "cyan" | "coral" | null;
  character: string | null;
  childCharacter: PublicChildCharacterDTO;
}

export interface PublicChildCharacterDTO {
  name: string;
  trait: string;
  archetype: PixelCharacterArchetype;
}

export interface PublicCampaignDTO {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  locale: string;
  timezone: string;
  theme: JsonObject;
  chapterCount: number;
  recipients: PublicRecipientDTO[];
  trustModel: "recipient_picker";
}

export interface PublicChapterOptionDTO {
  key: string;
  label: string;
}

export interface PublicMemoryImageDTO {
  url: string;
  alt: string;
  caption: string;
}

export interface PublicPixelQuestZoneDTO {
  id: string;
  title: string;
  scene: PixelMemoryScene;
  mapXPercent: number;
  mapYPercent: number;
  npcLine: string;
}

export interface PublicPixelQuestConfigDTO {
  version: 2;
  preset: "childhood-memory-atlas";
  mapWidthPx: number;
  mapHeightPx: number;
  zones: PublicPixelQuestZoneDTO[];
  noFailPath: true;
}

export interface PublicChapterDTO {
  id: string;
  orderIndex: number;
  gameType: ChapterGameType;
  title: string;
  body: string;
  prompt: string;
  options: PublicChapterOptionDTO[];
  memoryImages: PublicMemoryImageDTO[];
  pixelQuest: PublicPixelQuestConfigDTO;
}

export interface PublicSessionDTO {
  id: string;
  campaignId: string;
  recipientId: string;
  status: SessionStatus;
  currentChapterOrder: number;
  completedChapterCount: number;
  startedAt: string;
  completedAt: string | null;
  voucherRevealedAt: string | null;
}

export interface VoucherRevealDTO {
  id: string;
  title: string;
  description: string | null;
  code: string;
  codeHint: string | null;
  terms: string | null;
  expiresAt: string | null;
  revealedAt: string;
}

export interface RequestContext {
  ipHash: string | null;
  userAgent: string | null;
}

export interface StartSessionInput {
  campaignSlug: string;
  recipientId: string;
  clientEventId: string | null;
}

export interface RecordChoiceInput {
  chapterId: string;
  choiceKey: string;
  answerText: string | null;
  clientEventId: string | null;
  elapsedMs: number | null;
}

export interface TrackPixelQuestEventInput {
  eventName: PixelQuestEventName;
  chapterId: string;
  checkpointId: string | null;
  clientEventId: string;
  moveCount: number | null;
}

export interface TrackPixelQuestEventResult {
  accepted: true;
  duplicate: boolean;
}

export interface PublicCampaignResult {
  campaign: PublicCampaignDTO;
}

export interface StartSessionResult {
  token: string;
  session: PublicSessionDTO;
  recipient: PublicRecipientDTO;
  chapter: PublicChapterDTO;
}

export interface RecordChoiceResult {
  session: PublicSessionDTO;
  acceptedChoice: {
    chapterId: string;
    choiceKey: string;
    response: string | null;
  };
  nextChapter: PublicChapterDTO | null;
  completed: boolean;
}

export interface CompleteSessionResult {
  session: PublicSessionDTO;
  voucher: VoucherRevealDTO;
  alreadyRevealed: boolean;
}

export interface AdminIdentity {
  userId: string;
  email: string;
  role: Exclude<AdminRole, "viewer">;
  workspaceId: string;
}

export type RecipientPlayStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "voucher_revealed";

export interface AdminCampaignAnalyticsResult {
  campaignId: string;
  timezone: string;
  grain: "campaign/recipient/chapter/day";
  refreshedAt: string;
  refreshAfterSeconds: 60;
  recipients: Array<{
    recipientId: string;
    displayName: string;
    status: RecipientPlayStatus;
    sessionsStarted: number;
    latestActivityAt: string | null;
  }>;
  totals: {
    recipients: number;
    sessionsStarted: number;
    sessionsCompleted: number;
    vouchersRevealed: number;
    completionRate: number;
    voucherRevealRate: number;
    averageDurationMs: number | null;
  };
  chapterDropOff: Array<{
    chapterOrder: number;
    arrived: number;
    advanced: number;
    dropOffRate: number;
  }>;
  consistency: {
    sessionStartedEvents: number;
    voucherRevealEvents: number;
    matchesSessionSource: boolean;
  };
}

export interface AdminUser {
  id: string;
  email: string;
}

export interface AdminCampaignInput {
  slug: string;
  title: string;
  subtitle: string | null;
  locale: string;
  timezone: string;
  status: CampaignStatus;
  theme: JsonObject;
  settings: JsonObject;
  startsAt: string | null;
  endsAt: string | null;
}

export interface AdminCampaignPatch {
  slug?: string;
  title?: string;
  subtitle?: string | null;
  locale?: string;
  timezone?: string;
  status?: CampaignStatus;
  theme?: JsonObject;
  settings?: JsonObject;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface AdminChapterInput {
  orderIndex: number;
  title: string;
  body: string;
  prompt: string;
  options: ChapterOption[];
  isPublished: boolean;
  metadata: JsonObject;
}

export interface AdminVoucherInput {
  title: string;
  description: string | null;
  code: string;
  codeHint: string | null;
  terms: string | null;
  expiresAt: string | null;
  metadata: JsonObject;
}

export interface AdminMessageInput {
  senderLabel: string;
  body: string;
  consentStatus: MessageConsentStatus;
  revealAfterOrder: number;
  metadata: JsonObject;
}

export interface AdminRecipientInput {
  slug: string;
  displayName: string;
  relationLabel: string | null;
  birthdayDate: string | null;
  avatarUrl: string | null;
  status: RecipientStatus;
  metadata: JsonObject;
  chapters: AdminChapterInput[];
  messages: AdminMessageInput[];
  voucher: AdminVoucherInput | null;
}

export interface AdminRecipientPatch {
  slug?: string;
  displayName?: string;
  relationLabel?: string | null;
  birthdayDate?: string | null;
  avatarUrl?: string | null;
  status?: RecipientStatus;
  metadata?: JsonObject;
}
