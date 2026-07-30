import type {
  Campaign,
  Chapter,
  PublicCampaignDTO,
  PublicChapterDTO,
  PublicRecipientDTO,
  PublicSessionDTO,
  Recipient,
  GameSession,
  Voucher,
  VoucherRevealDTO,
} from "./types";
import { CHAPTER_GAME_TYPES, type ChapterGameType } from "./types";

const FALLBACK_GAME_TYPES: ChapterGameType[] = [
  "memory_piece",
  "detail_hunt",
  "message_unlock",
  "story_branch",
];

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

  return {
    id: recipient.id,
    slug: recipient.slug,
    displayName: recipient.displayName,
    relationLabel: recipient.relationLabel,
    avatarUrl: recipient.avatarUrl,
    accent: accent === "pear" || accent === "cyan" || accent === "coral" ? accent : null,
    character: typeof character === "string" ? character : null,
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
