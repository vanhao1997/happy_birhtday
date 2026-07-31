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
  type ChapterGameType,
  type PixelCharacterArchetype,
} from "./types";

const FALLBACK_GAME_TYPES: ChapterGameType[] = [
  "memory_piece",
  "detail_hunt",
  "message_unlock",
  "story_branch",
];

const MAX_MEMORY_IMAGES = 3;
const MAX_ALT_LENGTH = 160;
const MAX_CAPTION_LENGTH = 240;
const MAX_CHARACTER_NAME_LENGTH = 80;
const MAX_CHARACTER_TRAIT_LENGTH = 160;
const MAX_ZONE_TITLE_LENGTH = 64;
const MAX_NPC_LINE_LENGTH = 180;
const MIN_WORLD_WIDTH_PX = 1200;
const MAX_WORLD_WIDTH_PX = 3200;

export const DEFAULT_PIXEL_QUEST: PublicPixelQuestConfigDTO = {
  version: 1,
  preset: "royal-memory-kingdom",
  worldWidthPx: 1800,
  startPosition: 80,
  zones: [
    {
      id: "childhood-village",
      title: "Làng tuổi thơ",
      checkpointPosition: 480,
      npcLine: "Chào nhà thám hiểm! Ký ức đầu tiên đang đợi cạnh mái nhà quen.",
    },
    {
      id: "memory-castle",
      title: "Lâu đài ký ức",
      checkpointPosition: 960,
      npcLine: "Đi tiếp nhé. Cánh cổng chỉ mở bằng một điều bạn từng rất yêu thích.",
    },
    {
      id: "new-age-gate",
      title: "Cổng tuổi mới",
      checkpointPosition: 1520,
      npcLine: "Ba mảnh ký ức sẽ cùng soi sáng con đường bước sang tuổi mới.",
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
  const checkpointPosition = candidate.checkpointPosition;

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    || !title
    || !npcLine
    || typeof checkpointPosition !== "number"
    || !Number.isInteger(checkpointPosition)
  ) {
    return null;
  }

  return { id, title, checkpointPosition, npcLine };
}

export function publicPixelQuest(value: unknown): PublicPixelQuestConfigDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PIXEL_QUEST;
  }

  const candidate = value as Record<string, unknown>;
  const worldWidthPx = candidate.worldWidthPx;
  const startPosition = candidate.startPosition;
  const zones = Array.isArray(candidate.zones)
    ? candidate.zones.map(publicPixelQuestZone)
    : [];

  if (
    candidate.version !== 1
    || candidate.preset !== "royal-memory-kingdom"
    || candidate.noFailPath !== true
    || typeof worldWidthPx !== "number"
    || !Number.isInteger(worldWidthPx)
    || worldWidthPx < MIN_WORLD_WIDTH_PX
    || worldWidthPx > MAX_WORLD_WIDTH_PX
    || typeof startPosition !== "number"
    || !Number.isInteger(startPosition)
    || startPosition < 0
    || startPosition >= worldWidthPx
    || zones.length !== 3
    || zones.some((zone) => !zone)
  ) {
    return DEFAULT_PIXEL_QUEST;
  }

  const safeZones = zones as PublicPixelQuestZoneDTO[];
  const zoneIds = new Set(safeZones.map((zone) => zone.id));
  const checkpointsAreValid = safeZones.every((zone, index) => {
    const previous = safeZones[index - 1];
    return zone.checkpointPosition > startPosition
      && zone.checkpointPosition <= worldWidthPx - 80
      && (!previous || zone.checkpointPosition - previous.checkpointPosition >= 160);
  });

  if (zoneIds.size !== 3 || !checkpointsAreValid) {
    return DEFAULT_PIXEL_QUEST;
  }

  return {
    version: 1,
    preset: "royal-memory-kingdom",
    worldWidthPx,
    startPosition,
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
