import type { PublicChapterDTO, VoucherRevealDTO } from "@/lib/birthday/types";

export type ApiStatus = "idle" | "loading" | "success" | "error";

export type RecipientProfile = {
  slug: string;
  name: string;
  initials: string;
  note: string;
  palette: "pear" | "cyan" | "coral";
};

export type BirthdayChoice = {
  id: string;
  label: string;
  reply: string;
};

export type BirthdayChapter = {
  id: string;
  title: string;
  scene: string;
  prompt: string;
  choices: BirthdayChoice[];
};

export type VoucherOption = {
  id: string;
  label: string;
  detail: string;
};

export type BirthdayCampaign = {
  slug: string;
  title: string;
  recipient: RecipientProfile;
  chapters: BirthdayChapter[];
  vouchers: VoucherOption[];
};

export type BirthdaySession = {
  version: 1;
  slug: string;
  selectedName: string;
  recipientId?: string;
  token?: string;
  remoteSessionId?: string;
  remoteChapter?: PublicChapterDTO | null;
  nextChapter?: PublicChapterDTO | null;
  currentChapter: number;
  completedChapterIds: string[];
  answers: Record<string, string>;
  voucher?: VoucherRevealDTO;
  updatedAt: string;
};

// Kept for the unused legacy wizard while the new authenticated studio replaces it.
export type AdminMagicLinkRequest = {
  email: string;
  redirectTo: string;
};

export type AdminCampaignPayload = {
  workspaceId: string;
  title: string;
  slug: string;
  subtitle: string | null;
  locale: "vi-VN";
  timezone: "Asia/Bangkok";
  status: "draft" | "published";
  theme: { tone: "hum"; palette: "cream-pear-cyan-coral" };
  settings: {
    channel: "private_link" | "qr_card";
    voucherLabel: string;
    voucherLimit: number;
    recipientName: string;
    recipientInitials: string;
    chapters: BirthdayChapter[];
  };
  startsAt: string | null;
  endsAt: string | null;
};
