import type {
  Campaign,
  Chapter,
  PublicCampaignDTO,
  PublicChapterDTO,
  PublicMemoryImageDTO,
  PublicMemoryNpcDTO,
  PublicMemoryQuestDTO,
  PublicPixelQuestConfigDTO,
  PublicPixelQuestWorldDTO,
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
  MEMORY_QUEST_TYPES,
  PIXEL_CHARACTER_ARCHETYPES,
  PIXEL_MEMORY_SCENES,
  type ChapterGameType,
  type PixelCharacterArchetype,
  type PixelMemoryScene,
  type MemoryQuestType,
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
const MAX_QUEST_TEXT_LENGTH = 180;
const MAX_NPC_NAME_LENGTH = 64;
const MIN_MAP_WIDTH_PX = 800;
const MAX_MAP_WIDTH_PX = 2400;
const MIN_MAP_HEIGHT_PX = 480;
const MAX_MAP_HEIGHT_PX = 1400;
const CANONICAL_WORLD: PublicPixelQuestWorldDTO = {
  preset: "childhood-memory-atlas",
  widthPx: 1800,
  heightPx: 1120,
  cameraZoom: 0.76,
  playerRadiusPx: 22,
  stationRadiusPx: 112,
  spawnPoint: { x: 324, y: 888 },
};

const DEFAULT_QUEST_DEFINITIONS: Array<{
  type: MemoryQuestType;
  title: string;
  prompt: string;
  targetLabel: string;
  completionLine: string;
}> = [
  {
    type: "collect",
    title: "Nhặt mảnh ký ức",
    prompt: "Tìm mảnh sáng gần căn nhà và mang nó về cánh cửa nhỏ.",
    targetLabel: "Mảnh ký ức đầu tiên",
    completionLine: "Cánh cửa đã nhớ ra tên bạn.",
  },
  {
    type: "talk",
    title: "Gặp người giữ sân hè",
    prompt: "Đến gần người dẫn đường để nghe câu chuyện mùa hè.",
    targetLabel: "Người giữ sân hè",
    completionLine: "Một buổi chiều cũ đã trở lại trong tiếng cười.",
  },
  {
    type: "activate",
    title: "Bật đèn lớp học",
    prompt: "Kích hoạt chiếc đèn nhỏ trên bàn học cũ.",
    targetLabel: "Chiếc đèn bàn",
    completionLine: "Trang vở cũ sáng lên bằng một điều tự hào.",
  },
  {
    type: "deliver",
    title: "Đưa thư tới con đường mơ",
    prompt: "Mang lá thư nhỏ tới cột mốc trên con đường ước mơ.",
    targetLabel: "Lá thư ước mơ",
    completionLine: "Những ước mơ nhỏ đã tìm đúng đường về.",
  },
  {
    type: "story",
    title: "Mở cổng tuổi mới",
    prompt: "Đặt mảnh ghép cuối vào cánh cổng để khép lại hành trình.",
    targetLabel: "Cổng tuổi mới",
    completionLine: "Cánh cổng mở ra món quà dành riêng cho bạn.",
  },
];

function defaultQuestsForZones(zones: PublicPixelQuestZoneDTO[]): PublicMemoryQuestDTO[] {
  return zones.map((zone, index) => {
    const definition = DEFAULT_QUEST_DEFINITIONS[index] ?? DEFAULT_QUEST_DEFINITIONS[0]!;
    return {
      id: `quest-${zone.id}`,
      nodeId: zone.id,
      type: definition.type,
      title: definition.title,
      prompt: definition.prompt,
      targetLabel: definition.targetLabel,
      completionLine: definition.completionLine,
    };
  });
}

function defaultNpcsForZones(zones: PublicPixelQuestZoneDTO[]): PublicMemoryNpcDTO[] {
  return zones.slice(0, 4).map((zone, index) => ({
    id: `npc-${zone.id}`,
    nodeId: zone.id,
    name: index % 2 === 0 ? "Người giữ ký ức" : "Bạn đồng hành",
    role: index % 2 === 0 ? "Người dẫn đường" : "Người kể chuyện",
    line: zone.npcLine,
    archetype: index % 2 === 0 ? "soldier" : "guide",
  }));
}

export const DEFAULT_PIXEL_QUEST: PublicPixelQuestConfigDTO = {
  version: 3,
  preset: "childhood-memory-atlas",
  world: CANONICAL_WORLD,
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
      npcLine: "Bốn mảnh ký ức đầu đã sáng. Cánh cổng cuối đang giữ món quà riêng của bạn.",
    },
  ],
  quests: [],
  npcs: [],
  noFailPath: true,
};

DEFAULT_PIXEL_QUEST.quests = defaultQuestsForZones(DEFAULT_PIXEL_QUEST.zones);
DEFAULT_PIXEL_QUEST.npcs = defaultNpcsForZones(DEFAULT_PIXEL_QUEST.zones);

function safeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeWorld(candidate: Record<string, unknown>): PublicPixelQuestWorldDTO | null {
  const configuredWorld = candidate.world;
  const legacyWidth = candidate.mapWidthPx;
  const legacyHeight = candidate.mapHeightPx;
  const legacyZoom = candidate.zoom;
  const source = configuredWorld && typeof configuredWorld === "object" && !Array.isArray(configuredWorld)
    ? configuredWorld as Record<string, unknown>
    : null;
  const widthPx = source?.widthPx ?? legacyWidth;
  const heightPx = source?.heightPx ?? legacyHeight;

  if (
    typeof widthPx !== "number"
    || !Number.isInteger(widthPx)
    || widthPx < MIN_MAP_WIDTH_PX
    || widthPx > MAX_MAP_WIDTH_PX
    || typeof heightPx !== "number"
    || !Number.isInteger(heightPx)
    || heightPx < MIN_MAP_HEIGHT_PX
    || heightPx > MAX_MAP_HEIGHT_PX
  ) {
    return null;
  }

  const configuredZoom = source?.cameraZoom ?? legacyZoom;
  const cameraZoom = typeof configuredZoom === "number" && Number.isFinite(configuredZoom)
    ? Math.min(1, Math.max(0.5, configuredZoom))
    : CANONICAL_WORLD.cameraZoom;
  const spawnCandidate = source?.spawnPoint;
  const spawn = spawnCandidate && typeof spawnCandidate === "object" && !Array.isArray(spawnCandidate)
    ? spawnCandidate as Record<string, unknown>
    : null;
  const spawnX = typeof spawn?.x === "number" && Number.isFinite(spawn.x)
    ? Math.min(CANONICAL_WORLD.widthPx - CANONICAL_WORLD.playerRadiusPx, Math.max(CANONICAL_WORLD.playerRadiusPx, spawn.x))
    : CANONICAL_WORLD.spawnPoint.x;
  const spawnY = typeof spawn?.y === "number" && Number.isFinite(spawn.y)
    ? Math.min(CANONICAL_WORLD.heightPx - CANONICAL_WORLD.playerRadiusPx, Math.max(CANONICAL_WORLD.playerRadiusPx, spawn.y))
    : CANONICAL_WORLD.spawnPoint.y;

  // Farm preset is fixed in MVP. Legacy dimensions are accepted, then normalized.
  return {
    ...CANONICAL_WORLD,
    cameraZoom,
    spawnPoint: { x: spawnX, y: spawnY },
  };
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

function publicMemoryQuest(value: unknown, fallback: PublicMemoryQuestDTO): PublicMemoryQuestDTO | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const id = safeText(candidate.id, 64);
  const nodeId = safeText(candidate.nodeId, 64);
  const type = candidate.type;
  const title = safeText(candidate.title, MAX_QUEST_TEXT_LENGTH);
  const prompt = safeText(candidate.prompt, MAX_QUEST_TEXT_LENGTH);
  const targetLabel = safeText(candidate.targetLabel, MAX_QUEST_TEXT_LENGTH);
  const completionLine = safeText(candidate.completionLine, MAX_QUEST_TEXT_LENGTH);

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nodeId)
    || !MEMORY_QUEST_TYPES.includes(type as MemoryQuestType)
    || !title
    || !prompt
    || !targetLabel
    || !completionLine
  ) {
    return fallback;
  }

  return {
    id,
    nodeId,
    type: type as MemoryQuestType,
    title,
    prompt,
    targetLabel,
    completionLine,
  };
}

function publicMemoryNpc(value: unknown, fallback: PublicMemoryNpcDTO): PublicMemoryNpcDTO | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const candidate = value as Record<string, unknown>;
  const id = safeText(candidate.id, 64);
  const nodeId = safeText(candidate.nodeId, 64);
  const name = safeText(candidate.name, MAX_NPC_NAME_LENGTH);
  const role = safeText(candidate.role, MAX_NPC_NAME_LENGTH);
  const line = safeText(candidate.line, MAX_NPC_LINE_LENGTH);
  const archetype = candidate.archetype;

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nodeId)
    || !name
    || !role
    || !line
    || archetype !== "soldier"
      && archetype !== "orc"
      && archetype !== "guide"
  ) {
    return fallback;
  }

  return { id, nodeId, name, role, line, archetype };
}

export function publicPixelQuest(value: unknown): PublicPixelQuestConfigDTO {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_PIXEL_QUEST;
  }

  const candidate = value as Record<string, unknown>;
  const world = safeWorld(candidate);
  const zones = Array.isArray(candidate.zones)
    ? candidate.zones.map(publicPixelQuestZone)
    : [];

  if (
    candidate.version !== 2
      && candidate.version !== 3
    || candidate.preset !== "childhood-memory-atlas"
    || candidate.noFailPath !== true
    || !world
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

  const defaultQuests = defaultQuestsForZones(safeZones);
  const configuredQuests = Array.isArray(candidate.quests)
    ? candidate.quests.slice(0, 5).map((quest, index) => publicMemoryQuest(quest, defaultQuests[index]!))
    : defaultQuests;
  const quests = configuredQuests.length === 5 && configuredQuests.every((quest, index) => (
    Boolean(quest) && quest?.nodeId === safeZones[index]?.id
  ))
    ? configuredQuests as PublicMemoryQuestDTO[]
    : defaultQuests;
  const defaultNpcs = defaultNpcsForZones(safeZones);
  const configuredNpcs = Array.isArray(candidate.npcs)
    ? candidate.npcs.slice(0, 5).map((npc, index) => publicMemoryNpc(npc, defaultNpcs[index % defaultNpcs.length]!))
    : defaultNpcs;
  const npcs = configuredNpcs.filter((npc): npc is PublicMemoryNpcDTO => Boolean(npc));

  return {
    version: 3,
    preset: "childhood-memory-atlas",
    world,
    zones: safeZones,
    quests,
    npcs,
    noFailPath: true,
  };
}

export function pixelQuestToJson(config: PublicPixelQuestConfigDTO) {
  return JSON.parse(JSON.stringify(config)) as import("./types").JsonObject;
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
    worldVersion: session.worldVersion,
    lastCheckpointNode: session.lastCheckpointNode,
    stateVersion: session.stateVersion,
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
