import type {
  Campaign,
  Chapter,
  PublicCampaignDTO,
  PublicChapterDTO,
  PublicMemoryImageDTO,
  PublicPixelQuestConfigDTO,
  PublicPixelQuestZoneDTO,
  PublicRecipientDTO,
  PublicSessionDTO,
  Recipient,
  GameSession,
  Voucher,
  VoucherRevealDTO,
} from "./types";
import {
  CHAPTER_GAME_TYPES,
  PIXEL_CHARACTER_ARCHETYPES,
  PIXEL_MEMORY_SCENES,
  type ChapterGameType,
  type PixelCharacterArchetype,
  type PixelMemoryScene,
} from "./types";

const FALLBACK_GAME_TYPES: ChapterGameType[] = [
  "memory_piece",
  "detail_hunt",
  "message_unlock",
  "story_branch",
];

const MAX_MEMORY_IMAGES = 5;
const MAX_ALT_LENGTH = 160;
const MAX_CAPTION_LENGTH = 240;
const MAX_CHARACTER_NAME_LENGTH = 80;
const MAX_CHARACTER_TRAIT_LENGTH = 160;
const MAX_ZONE_TITLE_LENGTH = 64;
const MAX_NPC_LINE_LENGTH = 180;
const MIN_MAP_WIDTH_PX = 800;
const MAX_MAP_WIDTH_PX = 2400;
const MIN_MAP_HEIGHT_PX = 480;
const MAX_MAP_HEIGHT_PX = 1400;

export const DEFAULT_PIXEL_QUEST: PublicPixelQuestConfigDTO = {
  version: 2,
  preset: "childhood-memory-atlas",
  mapWidthPx: 1200,
  mapHeightPx: 760,
  zones: [
    {
      id: "childhood-home",
      title: "Ngôi nhà tuổi thơ",
      scene: "childhood-home",
      mapXPercent: 14,
      mapYPercent: 73,
      npcLine: "Cánh cửa nhỏ mở ra nơi câu chuyện của bạn bắt đầu.",
    },
    {
      id: "summer-playground",
      title: "Sân chơi mùa hè",
      scene: "summer-playground",
      mapXPercent: 34,
      mapYPercent: 43,
      npcLine: "Một buổi chiều đầy nắng vẫn còn nằm giữa tiếng cười và trò chơi cũ.",
    },
    {
      id: "old-classroom",
      title: "Lớp học ngày xưa",
      scene: "old-classroom",
      mapXPercent: 53,
      mapYPercent: 66,
      npcLine: "Bàn học cũ giữ lại một điều từng khiến bạn thật tự hào.",
    },
    {
      id: "dream-road",
      title: "Con đường ước mơ",
      scene: "dream-road",
      mapXPercent: 72,
      mapYPercent: 34,
      npcLine: "Con đường uốn qua những ước mơ nhỏ từng được bạn tin là thật.",
    },
    {
      id: "new-age-gate",
      title: "Cổng tuổi mới",
      scene: "new-age-gate",
      mapXPercent: 88,
      mapYPercent: 69,
      npcLine: "Bốn mảnh ký ức đã sáng. Cánh cổng cuối đang giữ món quà riêng của bạn.",
    },
  ],
  noFailPath: true,
};

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isSafeImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function publicMemoryImages(value: unknown): PublicMemoryImageDTO[] {
  if (!Array.isArray(value)) return [];

  const images: PublicMemoryImageDTO[] = [];

  for (const item of value) {
    if (images.length >= MAX_MEMORY_IMAGES) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;

    const candidate = item as Record<string, unknown>;
    if (!isSafeImageUrl(candidate.url)) continue;

    const caption = safeText(candidate.caption, MAX_CAPTION_LENGTH);
    images.push({
      url: candidate.url,
      alt: safeText(candidate.alt, MAX_ALT_LENGTH) || caption || `Ảnh tuổi thơ ${images.length + 1}`,
      caption,
    });
  }

  return images;
}

function publicPixelQuestZone(value: unknown): PublicPixelQuestZoneDTO | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const id = safeText(candidate.id, 64);
  const title = safeText(candidate.title, MAX_ZONE_TITLE_LENGTH);
  const npcLine = safeText(candidate.npcLine, MAX_NPC_LINE_LENGTH);
  const scene = candidate.scene;
  const mapXPercent = candidate.mapXPercent;
  const mapYPercent = candidate.mapYPercent;

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    || !title
    || !npcLine
    || !PIXEL_MEMORY_SCENES.includes(scene as PixelMemoryScene)
    || typeof mapXPercent !== "number"
    || !Number.isFinite(mapXPercent)
    || mapXPercent < 5
    || mapXPercent > 95
    || typeof mapYPercent !== "number"
    || !Number.isFinite(mapYPercent)
    || mapYPercent < 8
    || mapYPercent > 92
  ) {
    return null;
  }

  return {
    id,
    title,
    scene: scene as PixelMemoryScene,
    mapXPercent,
    mapYPercent,
    npcLine,
  };
}

export function publicPixelQuest(value: unknown): PublicPixelQuestConfigDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PIXEL_QUEST;
  }

  const candidate = value as Record<string, unknown>;
  const mapWidthPx = candidate.mapWidthPx;
  const mapHeightPx = candidate.mapHeightPx;
  const zones = Array.isArray(candidate.zones)
    ? candidate.zones.map(publicPixelQuestZone)
    : [];

  if (
    candidate.version !== 2
    || candidate.preset !== "childhood-memory-atlas"
    || candidate.noFailPath !== true
    || typeof mapWidthPx !== "number"
    || !Number.isInteger(mapWidthPx)
    || mapWidthPx < MIN_MAP_WIDTH_PX
    || mapWidthPx > MAX_MAP_WIDTH_PX
    || typeof mapHeightPx !== "number"
    || !Number.isInteger(mapHeightPx)
    || mapHeightPx < MIN_MAP_HEIGHT_PX
    || mapHeightPx > MAX_MAP_HEIGHT_PX
    || zones.length !== 5
    || zones.some((zone) => !zone)
  ) {
    return DEFAULT_PIXEL_QUEST;
  }

  const safeZones = zones as PublicPixelQuestZoneDTO[];
  const zoneIds = new Set(safeZones.map((zone) => zone.id));
  const scenes = new Set(safeZones.map((zone) => zone.scene));

  if (zoneIds.size !== 5 || scenes.size !== 5) {
    return DEFAULT_PIXEL_QUEST;
  }

  return {
    version: 2,
    preset: "childhood-memory-atlas",
    mapWidthPx,
    mapHeightPx,
    zones: safeZones,
    noFailPath: true,
  };
}

export function toPublicCampaignDTO(
  campaign: Campaign,
  recipients: Recipient[],
  chapterCount: number,
): PublicCampaignDTO {
  return {
    id: campaign.id,
    slug: campaign.slug,
    title: campaign.title,
    subtitle: campaign.subtitle,
    locale: campaign.locale,
    timezone: campaign.timezone,
    theme: campaign.theme,
    chapterCount,
    recipients: recipients.map(toPublicRecipientDTO),
    trustModel: "recipient_picker",
  };
}

export function toPublicRecipientDTO(recipient: Recipient): PublicRecipientDTO {
  const accent = recipient.metadata.accent;
  const character = recipient.metadata.character;
  const childCharacterName = safeText(
    recipient.metadata.childCharacterName,
    MAX_CHARACTER_NAME_LENGTH,
  );
  const childCharacterTrait = safeText(
    recipient.metadata.childCharacterTrait,
    MAX_CHARACTER_TRAIT_LENGTH,
  );
  const configuredArchetype = recipient.metadata.childCharacterArchetype;
  const fallbackArchetype: PixelCharacterArchetype = accent === "cyan"
    ? "prince"
    : accent === "coral"
      ? "emperor"
      : "princess";
  const archetype = PIXEL_CHARACTER_ARCHETYPES.includes(
    configuredArchetype as PixelCharacterArchetype,
  )
    ? configuredArchetype as PixelCharacterArchetype
    : fallbackArchetype;

  return {
    id: recipient.id,
    slug: recipient.slug,
    displayName: recipient.displayName,
    relationLabel: recipient.relationLabel,
    avatarUrl: recipient.avatarUrl,
    accent: accent === "pear" || accent === "cyan" || accent === "coral" ? accent : null,
    character: typeof character === "string" ? character : null,
    childCharacter: {
      name: childCharacterName || `Bé ${recipient.displayName}`,
      trait: childCharacterTrait || "Tò mò, thích khám phá những điều thân quen",
      archetype,
    },
  };
}

export function toPublicChapterDTO(chapter: Chapter): PublicChapterDTO {
  const configuredGameType = chapter.metadata.gameType;
  const gameType = CHAPTER_GAME_TYPES.includes(configuredGameType as ChapterGameType)
    ? configuredGameType as ChapterGameType
    : FALLBACK_GAME_TYPES[chapter.orderIndex - 1] ?? "story_branch";

  return {
    id: chapter.id,
    orderIndex: chapter.orderIndex,
    gameType,
    title: chapter.title,
    body: chapter.body,
    prompt: chapter.prompt,
    options: chapter.options.map((option) => ({
      key: option.key,
      label: option.label,
    })),
    memoryImages: publicMemoryImages(chapter.metadata.memoryImages),
    pixelQuest: publicPixelQuest(chapter.metadata.pixelQuest),
  };
}

export function toPublicSessionDTO(session: GameSession): PublicSessionDTO {
  return {
    id: session.id,
    campaignId: session.campaignId,
    recipientId: session.recipientId,
    status: session.status,
    currentChapterOrder: session.currentChapterOrder,
    completedChapterCount: session.completedChapters,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    voucherRevealedAt: session.voucherRevealedAt,
  };
}

export function toVoucherRevealDTO(
  voucher: Voucher,
  code: string,
  revealedAt: string,
): VoucherRevealDTO {
  return {
    id: voucher.id,
    title: voucher.title,
    description: voucher.description,
    code,
    codeHint: voucher.codeHint,
    terms: voucher.terms,
    expiresAt: voucher.expiresAt,
    revealedAt,
  };
}
