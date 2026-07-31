import type {
  AdminCampaignInput,
  AdminCampaignAnalyticsResult,
  AdminCampaignPatch,
  AdminChapterInput,
  AdminIdentity,
  AdminRecipientInput,
  AdminRecipientPatch,
  AdminVoucherInput,
  Campaign,
  CompleteSessionResult,
  PublicCampaignResult,
  Recipient,
  RecordChoiceInput,
  RecordChoiceResult,
  RequestContext,
  StartSessionInput,
  StartSessionResult,
  TrackPixelQuestEventInput,
  TrackPixelQuestEventResult,
  Voucher,
} from "./types";
import { DemoBirthdayRepository } from "./demo-repository";
import { hasSupabasePersistenceConfig } from "./supabase-rest";
import { SupabaseBirthdayRepository } from "./supabase-repository";

export interface BirthdayRepository {
  readonly mode: "demo" | "supabase";

  getPublicCampaign(slug: string, context: RequestContext): Promise<PublicCampaignResult>;
  startSession(input: StartSessionInput, context: RequestContext): Promise<StartSessionResult>;
  recordChoice(
    token: string,
    input: RecordChoiceInput,
    context: RequestContext,
  ): Promise<RecordChoiceResult>;
  completeSession(token: string, context: RequestContext): Promise<CompleteSessionResult>;
  trackPixelQuestEvent(
    token: string,
    input: TrackPixelQuestEventInput,
    context: RequestContext,
  ): Promise<TrackPixelQuestEventResult>;

  listAdminCampaigns(auth: AdminIdentity): Promise<Campaign[]>;
  createAdminCampaign(auth: AdminIdentity, input: AdminCampaignInput): Promise<Campaign>;
  getAdminCampaign(auth: AdminIdentity, campaignId: string): Promise<Campaign>;
  getAdminCampaignAnalytics(
    auth: AdminIdentity,
    campaignId: string,
  ): Promise<AdminCampaignAnalyticsResult>;
  updateAdminCampaign(
    auth: AdminIdentity,
    campaignId: string,
    patch: AdminCampaignPatch,
  ): Promise<Campaign>;
  deleteAdminCampaign(auth: AdminIdentity, campaignId: string): Promise<{ deleted: true }>;
  listAdminRecipients(auth: AdminIdentity, campaignId: string): Promise<Recipient[]>;
  createAdminRecipient(
    auth: AdminIdentity,
    campaignId: string,
    input: AdminRecipientInput,
  ): Promise<Recipient>;
  updateAdminRecipient(
    auth: AdminIdentity,
    recipientId: string,
    patch: AdminRecipientPatch,
  ): Promise<Recipient>;
  deleteAdminRecipient(auth: AdminIdentity, recipientId: string): Promise<{ deleted: true }>;
  upsertAdminChapters(
    auth: AdminIdentity,
    recipientId: string,
    chapters: AdminChapterInput[],
  ): Promise<{ count: number }>;
  upsertAdminVoucher(
    auth: AdminIdentity,
    recipientId: string,
    voucher: AdminVoucherInput,
  ): Promise<Voucher>;
}

declare global {
  var __birthdayDemoRepository: DemoBirthdayRepository | undefined;
}

export function getBirthdayRepository(): BirthdayRepository {
  if (hasSupabasePersistenceConfig()) {
    return new SupabaseBirthdayRepository();
  }

  globalThis.__birthdayDemoRepository ??= new DemoBirthdayRepository();
  return globalThis.__birthdayDemoRepository;
}
