import {
  APP_TIMEZONE,
  PIXEL_QUEST_EVENT_NAMES,
  REQUIRED_CHAPTER_COUNT,
  type AdminCampaignInput,
  type AdminCampaignPatch,
  type AdminChapterInput,
  type AdminMessageInput,
  type AdminRecipientInput,
  type AdminRecipientPatch,
  type AdminVoucherInput,
  type CampaignStatus,
  type ChapterOption,
  type JsonObject,
  type RecordChoiceInput,
  type RecordQuestProgressInput,
  type RecipientStatus,
  type StartSessionInput,
  type PixelQuestEventName,
  type TrackPixelQuestEventInput,
} from "./types";
import { badRequest } from "./errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw badRequest(`${field} must be a UUID`);
  }

  return value;
}

export function assertSlug(value: unknown, field: string): string {
  if (typeof value !== "string" || !SLUG_RE.test(value) || value.length > 96) {
    throw badRequest(`${field} must be a lowercase URL slug`);
  }

  return value;
}

export function assertEmail(value: unknown, field = "email"): string {
  if (typeof value !== "string" || !EMAIL_RE.test(value) || value.length > 320) {
    throw badRequest(`${field} must be a valid email`);
  }

  return value.toLowerCase();
}

export function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.length > maxLength) {
    throw badRequest(`${field} must be a string up to ${maxLength} characters`);
  }

  return value;
}

export function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw badRequest(`${field} must be a non-empty string up to ${maxLength} characters`);
  }

  return value.trim();
}

export function optionalIsoDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw badRequest(`${field} must be YYYY-MM-DD`);
  }

  return value;
}

export function optionalIsoDateTime(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw badRequest(`${field} must be an ISO datetime`);
  }

  return new Date(value).toISOString();
}

export function optionalUrl(value: unknown, field: string): string | null {
  const stringValue = optionalString(value, field, 2048);
  if (!stringValue) {
    return null;
  }

  try {
    const url = new URL(stringValue);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("invalid protocol");
    }
  } catch {
    throw badRequest(`${field} must be an http(s) URL`);
  }

  return stringValue;
}

export function jsonObject(value: unknown, field: string): JsonObject {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw badRequest(`${field} must be an object`);
  }

  return value as JsonObject;
}

export function parseStartSession(body: JsonObject): StartSessionInput {
  return {
    campaignSlug: assertSlug(body.campaignSlug, "campaignSlug"),
    recipientId: assertUuid(body.recipientId, "recipientId"),
    clientEventId: optionalString(body.clientEventId, "clientEventId", 128),
  };
}

export function parseRecordChoice(body: JsonObject): RecordChoiceInput {
  const elapsedMs = body.elapsedMs;

  if (elapsedMs !== undefined && elapsedMs !== null) {
    if (
      typeof elapsedMs !== "number" ||
      !Number.isInteger(elapsedMs) ||
      elapsedMs < 0 ||
      elapsedMs > 60 * 60 * 1000
    ) {
      throw badRequest("elapsedMs must be an integer between 0 and 3600000");
    }
  }

  return {
    chapterId: assertUuid(body.chapterId, "chapterId"),
    choiceKey: requiredString(body.choiceKey, "choiceKey", 64),
    answerText: optionalString(body.answerText, "answerText", 1000),
    clientEventId: optionalString(body.clientEventId, "clientEventId", 128),
    elapsedMs: typeof elapsedMs === "number" ? elapsedMs : null,
  };
}

export function parseQuestProgress(body: JsonObject): RecordQuestProgressInput {
  const elapsedMs = body.elapsedMs;
  if (
    elapsedMs !== undefined
    && elapsedMs !== null
    && (
      typeof elapsedMs !== "number"
      || !Number.isInteger(elapsedMs)
      || elapsedMs < 0
      || elapsedMs > 60 * 60 * 1000
    )
  ) {
    throw badRequest("elapsedMs must be an integer between 0 and 3600000");
  }

  const nodeId = requiredString(body.nodeId, "nodeId", 64);
  const objectiveId = requiredString(body.objectiveId, "objectiveId", 64);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nodeId) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(objectiveId)) {
    throw badRequest("nodeId and objectiveId must be lowercase slugs");
  }

  return {
    chapterId: assertUuid(body.chapterId, "chapterId"),
    nodeId,
    objectiveId,
    clientEventId: requiredString(body.clientEventId, "clientEventId", 128),
    elapsedMs: typeof elapsedMs === "number" ? elapsedMs : null,
  };
}

export function parsePixelQuestEvent(body: JsonObject): TrackPixelQuestEventInput {
  const eventName = body.eventName;
  if (!PIXEL_QUEST_EVENT_NAMES.includes(eventName as PixelQuestEventName)) {
    throw badRequest("eventName is not an allowed pixel quest event");
  }

  const checkpointId = optionalString(body.checkpointId, "checkpointId", 64);
  const checkpointEvents: PixelQuestEventName[] = [
    "pixel_quest_checkpoint",
    "npc_dialog_opened",
    "quest_started",
    "memory_revealed",
    "checkpoint_reached",
  ];
  if (eventName === "pixel_quest_checkpoint" && !checkpointId) {
    throw badRequest("checkpointId is required for pixel_quest_checkpoint");
  }
  if (!checkpointEvents.includes(eventName as PixelQuestEventName) && checkpointId) {
    throw badRequest("checkpointId is not allowed for this eventName");
  }

  const moveCount = body.moveCount;
  if (
    moveCount !== undefined
    && moveCount !== null
    && (
      typeof moveCount !== "number"
      || !Number.isInteger(moveCount)
      || moveCount < 0
      || moveCount > 10000
    )
  ) {
    throw badRequest("moveCount must be an integer between 0 and 10000");
  }

  return {
    eventName: eventName as PixelQuestEventName,
    chapterId: assertUuid(body.chapterId, "chapterId"),
    checkpointId,
    clientEventId: requiredString(body.clientEventId, "clientEventId", 128),
    moveCount: typeof moveCount === "number" ? moveCount : null,
  };
}

export function parseMagicLink(body: JsonObject): { email: string; redirectTo: string | null } {
  return {
    email: assertEmail(body.email),
    redirectTo: optionalUrl(body.redirectTo, "redirectTo"),
  };
}

export function parseCampaignInput(body: JsonObject): AdminCampaignInput {
  return {
    slug: assertSlug(body.slug, "slug"),
    title: requiredString(body.title, "title", 160),
    subtitle: optionalString(body.subtitle, "subtitle", 240),
    locale: optionalString(body.locale, "locale", 20) ?? "vi-VN",
    timezone: optionalString(body.timezone, "timezone", 64) ?? APP_TIMEZONE,
    status: parseCampaignStatus(body.status, "status", "draft"),
    theme: jsonObject(body.theme, "theme"),
    settings: jsonObject(body.settings, "settings"),
    startsAt: optionalIsoDateTime(body.startsAt, "startsAt"),
    endsAt: optionalIsoDateTime(body.endsAt, "endsAt"),
  };
}

export function parseCampaignPatch(body: JsonObject): AdminCampaignPatch {
  const patch: AdminCampaignPatch = {};

  if (body.slug !== undefined) patch.slug = assertSlug(body.slug, "slug");
  if (body.title !== undefined) patch.title = requiredString(body.title, "title", 160);
  if (body.subtitle !== undefined) patch.subtitle = optionalString(body.subtitle, "subtitle", 240);
  if (body.locale !== undefined) patch.locale = requiredString(body.locale, "locale", 20);
  if (body.timezone !== undefined) patch.timezone = requiredString(body.timezone, "timezone", 64);
  if (body.status !== undefined) patch.status = parseCampaignStatus(body.status, "status");
  if (body.theme !== undefined) patch.theme = jsonObject(body.theme, "theme");
  if (body.settings !== undefined) patch.settings = jsonObject(body.settings, "settings");
  if (body.startsAt !== undefined) patch.startsAt = optionalIsoDateTime(body.startsAt, "startsAt");
  if (body.endsAt !== undefined) patch.endsAt = optionalIsoDateTime(body.endsAt, "endsAt");

  return patch;
}

export function parseRecipientInput(body: JsonObject): AdminRecipientInput {
  const chaptersValue = body.chapters;
  if (!Array.isArray(chaptersValue) || chaptersValue.length !== REQUIRED_CHAPTER_COUNT) {
    throw badRequest(`chapters must contain exactly ${REQUIRED_CHAPTER_COUNT} items`);
  }

  const voucher = body.voucher === undefined || body.voucher === null
    ? null
    : parseVoucherInputObject(body.voucher, "voucher");

  const messagesValue = body.messages ?? [];
  if (!Array.isArray(messagesValue) || messagesValue.length > 20) {
    throw badRequest("messages must contain up to 20 items");
  }

  return {
    slug: assertSlug(body.slug, "slug"),
    displayName: requiredString(body.displayName, "displayName", 120),
    relationLabel: optionalString(body.relationLabel, "relationLabel", 120),
    birthdayDate: optionalIsoDate(body.birthdayDate, "birthdayDate"),
    avatarUrl: optionalUrl(body.avatarUrl, "avatarUrl"),
    status: parseRecipientStatus(body.status, "status", "active"),
    metadata: jsonObject(body.metadata, "metadata"),
    chapters: chaptersValue.map((chapter, index) => parseChapterInputObject(chapter, index)),
    messages: messagesValue.map((message, index) => parseMessageInputObject(message, index)),
    voucher,
  };
}

export function parseRecipientPatch(body: JsonObject): AdminRecipientPatch {
  const patch: AdminRecipientPatch = {};

  if (body.slug !== undefined) patch.slug = assertSlug(body.slug, "slug");
  if (body.displayName !== undefined) {
    patch.displayName = requiredString(body.displayName, "displayName", 120);
  }
  if (body.relationLabel !== undefined) {
    patch.relationLabel = optionalString(body.relationLabel, "relationLabel", 120);
  }
  if (body.birthdayDate !== undefined) {
    patch.birthdayDate = optionalIsoDate(body.birthdayDate, "birthdayDate");
  }
  if (body.avatarUrl !== undefined) patch.avatarUrl = optionalUrl(body.avatarUrl, "avatarUrl");
  if (body.status !== undefined) patch.status = parseRecipientStatus(body.status, "status");
  if (body.metadata !== undefined) patch.metadata = jsonObject(body.metadata, "metadata");

  return patch;
}

export function parseChaptersInput(body: JsonObject): AdminChapterInput[] {
  if (!Array.isArray(body.chapters) || body.chapters.length !== REQUIRED_CHAPTER_COUNT) {
    throw badRequest(`chapters must contain exactly ${REQUIRED_CHAPTER_COUNT} items`);
  }

  return body.chapters.map((chapter, index) => parseChapterInputObject(chapter, index));
}

export function parseVoucherInput(body: JsonObject): AdminVoucherInput {
  return parseVoucherInputObject(body, "voucher");
}

function parseCampaignStatus(
  value: unknown,
  field: string,
  fallback?: CampaignStatus,
): CampaignStatus {
  if (value === undefined || value === null || value === "") {
    if (fallback) return fallback;
    throw badRequest(`${field} is required`);
  }

  if (value !== "draft" && value !== "published" && value !== "archived") {
    throw badRequest(`${field} must be draft, published, or archived`);
  }

  return value;
}

function parseRecipientStatus(
  value: unknown,
  field: string,
  fallback?: RecipientStatus,
): RecipientStatus {
  if (value === undefined || value === null || value === "") {
    if (fallback) return fallback;
    throw badRequest(`${field} is required`);
  }

  if (value !== "active" && value !== "hidden" && value !== "archived") {
    throw badRequest(`${field} must be active, hidden, or archived`);
  }

  return value;
}

function parseChapterInputObject(value: unknown, index: number): AdminChapterInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`chapters[${index}] must be an object`);
  }

  const item = value as JsonObject;
  const orderIndex = item.orderIndex;
  if (
    typeof orderIndex !== "number" ||
    !Number.isInteger(orderIndex) ||
    orderIndex < 1 ||
    orderIndex > REQUIRED_CHAPTER_COUNT
  ) {
    throw badRequest(`chapters[${index}].orderIndex must be 1-${REQUIRED_CHAPTER_COUNT}`);
  }

  return {
    orderIndex,
    title: requiredString(item.title, `chapters[${index}].title`, 160),
    body: requiredString(item.body, `chapters[${index}].body`, 4000),
    prompt: requiredString(item.prompt, `chapters[${index}].prompt`, 500),
    options: parseOptions(item.options, `chapters[${index}].options`),
    isPublished: typeof item.isPublished === "boolean" ? item.isPublished : true,
    metadata: jsonObject(item.metadata, `chapters[${index}].metadata`),
  };
}

function parseOptions(value: unknown, field: string): ChapterOption[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) {
    throw badRequest(`${field} must contain 1-6 options`);
  }

  const keys = new Set<string>();

  return value.map((option, index) => {
    if (typeof option !== "object" || option === null || Array.isArray(option)) {
      throw badRequest(`${field}[${index}] must be an object`);
    }

    const item = option as JsonObject;
    const key = requiredString(item.key, `${field}[${index}].key`, 64);
    if (keys.has(key)) {
      throw badRequest(`${field} option keys must be unique`);
    }
    keys.add(key);

    return {
      key,
      label: requiredString(item.label, `${field}[${index}].label`, 240),
      response: optionalString(item.response, `${field}[${index}].response`, 1000) ?? undefined,
      isCorrect: typeof item.isCorrect === "boolean" ? item.isCorrect : undefined,
      metadata: jsonObject(item.metadata, `${field}[${index}].metadata`),
    };
  });
}

function parseVoucherInputObject(value: unknown, field: string): AdminVoucherInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`${field} must be an object`);
  }

  const item = value as JsonObject;

  return {
    title: requiredString(item.title, `${field}.title`, 160),
    description: optionalString(item.description, `${field}.description`, 1000),
    code: requiredString(item.code, `${field}.code`, 500),
    codeHint: optionalString(item.codeHint, `${field}.codeHint`, 240),
    terms: optionalString(item.terms, `${field}.terms`, 1000),
    expiresAt: optionalIsoDateTime(item.expiresAt, `${field}.expiresAt`),
    metadata: jsonObject(item.metadata, `${field}.metadata`),
  };
}

function parseMessageInputObject(value: unknown, index: number): AdminMessageInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw badRequest(`messages[${index}] must be an object`);
  }

  const item = value as JsonObject;
  const consentStatus = item.consentStatus ?? "approved";
  if (consentStatus !== "pending" && consentStatus !== "approved" && consentStatus !== "revoked") {
    throw badRequest(`messages[${index}].consentStatus must be pending, approved, or revoked`);
  }

  const revealAfterOrder = item.revealAfterOrder ?? REQUIRED_CHAPTER_COUNT;
  if (
    typeof revealAfterOrder !== "number" ||
    !Number.isInteger(revealAfterOrder) ||
    revealAfterOrder < 1 ||
    revealAfterOrder > REQUIRED_CHAPTER_COUNT
  ) {
    throw badRequest(`messages[${index}].revealAfterOrder must be 1-${REQUIRED_CHAPTER_COUNT}`);
  }

  return {
    senderLabel: requiredString(item.senderLabel, `messages[${index}].senderLabel`, 120),
    body: requiredString(item.body, `messages[${index}].body`, 2000),
    consentStatus,
    revealAfterOrder,
    metadata: jsonObject(item.metadata, `messages[${index}].metadata`),
  };
}
