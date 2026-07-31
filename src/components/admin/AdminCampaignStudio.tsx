"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { initialsFromName, toBirthdaySlug } from "../birthday/content";
import type { ApiStatus } from "../birthday/types";
import { apiErrorMessage } from "@/lib/api-error";
import { DEFAULT_PIXEL_QUEST, pixelQuestToJson } from "@/lib/birthday/dto";
import type {
  AdminCampaignAnalyticsResult,
  ChapterGameType,
  MemoryQuestType,
  PixelCharacterArchetype,
} from "@/lib/birthday/types";

type EditableOption = {
  key: string;
  label: string;
  response: string;
};

type EditableChapter = {
  orderIndex: number;
  gameType: ChapterGameType;
  title: string;
  body: string;
  prompt: string;
  options: EditableOption[];
};

type EditableMemoryPhoto = {
  url: string;
  caption: string;
  title: string;
  npcName: string;
  npcRole: string;
  npcLine: string;
  questType: MemoryQuestType;
  questTitle: string;
  questPrompt: string;
  questTargetLabel: string;
  questCompletionLine: string;
};

const CHAPTER_GAME_LABELS: Record<ChapterGameType, string> = {
  memory_piece: "Mảnh ghép ký ức",
  detail_hunt: "Tìm chi tiết riêng",
  message_unlock: "Mở lời kể đồng đội",
  story_branch: "Ngã rẽ cá nhân",
};
const PIXEL_CHARACTER_LABELS: Record<PixelCharacterArchetype, string> = {
  princess: "Công chúa",
  prince: "Hoàng tử",
  emperor: "Hoàng thượng",
  knight: "Kỵ sĩ",
};

const PLAY_STATUS_LABELS: Record<
  AdminCampaignAnalyticsResult["recipients"][number]["status"],
  string
> = {
  not_started: "Chưa chơi",
  in_progress: "Đang chơi",
  completed: "Hoàn thành",
  voucher_revealed: "Đã mở voucher",
};

function formatPercent(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDuration(value: number | null) {
  if (value === null) return "-";
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.round((value % 60_000) / 1000);
  return `${minutes}p ${seconds}s`;
}

type EditableRecipient = {
  clientId: string;
  displayName: string;
  relationLabel: string;
  birthdayDate: string;
  avatarUrl: string;
  childhoodPhotos: EditableMemoryPhoto[];
  accent: "pear" | "cyan" | "coral";
  character: string;
  childCharacterName: string;
  childCharacterTrait: string;
  childCharacterArchetype: PixelCharacterArchetype;
  chapters: EditableChapter[];
  messageSender: string;
  messageBody: string;
  consentStatus: "pending" | "approved" | "revoked";
  voucherTitle: string;
  voucherDescription: string;
  voucherCode: string;
  voucherHint: string;
  voucherTerms: string;
  voucherExpiresAt: string;
};

type AdminIdentity = {
  userId: string;
  email: string;
  role: "owner" | "admin" | "editor";
  workspaceId: string;
};

const ADMIN_STEPS = [
  "Chiến dịch",
  "Người chơi",
  "Năm trạm",
  "Lời nhắn",
  "Voucher",
  "Preview",
] as const;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const defaultWorkspaceId =
  process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID ?? "11111111-1111-4111-8111-111111111111";

function chapterSet(name: string, role: string): EditableChapter[] {
  return [
    {
      orderIndex: 1,
      gameType: "memory_piece",
      title: "Mảnh ghép đầu tiên",
      body: `${name}, hôm nay câu chuyện bắt đầu từ điều cả đội luôn ghi nhận: ${role.toLowerCase()}.`,
      prompt: "Mở trạm đầu tiên trên bản đồ tuổi thơ.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Mảnh ký ức đầu tiên đã được giữ lại." },
      ],
    },
    {
      orderIndex: 2,
      gameType: "detail_hunt",
      title: "Khoảnh khắc chỉ bạn mới có",
      body: "Nhắc lại một tình huống thật ở công ty: một lần hỗ trợ, một câu nói quen, hoặc một chi tiết nhỏ khiến mọi người nhớ tới bạn.",
      prompt: "Đi tiếp tới trạm thứ hai.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Ký ức thứ hai đã trở thành dấu mốc." },
      ],
    },
    {
      orderIndex: 3,
      gameType: "message_unlock",
      title: "Lời kể từ đồng đội",
      body: "Một lời nhắn đã được đồng đội đồng ý sử dụng sẽ xuất hiện tại đây.",
      prompt: "Đi theo đường chấm tới lớp học cũ.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Lời cảm ơn đã được đặt cạnh ký ức thứ ba." },
      ],
    },
    {
      orderIndex: 4,
      gameType: "story_branch",
      title: "Con đường ước mơ",
      body: "Con đường cuối đi qua những ước mơ nhỏ trước khi tới cổng tuổi mới.",
      prompt: "Đi hết con đường để thắp sáng cổng tuổi mới.",
      options: [
        { key: "station-complete", label: "Đã khám phá", response: "Bốn mảnh ký ức đã cùng thắp sáng cánh cổng cuối." },
      ],
    },
  ];
}

function memoryMapFor(displayName: string, stations: EditableMemoryPhoto[]) {
  const name = displayName.trim() || "bạn";
  const lines = [
    `${name} ơi, cánh cửa nhỏ đang giữ nơi câu chuyện bắt đầu.`,
    `Một buổi chiều đầy nắng của ${name} vẫn còn nằm giữa sân chơi này.`,
    `Bàn học cũ giữ lại một điều từng khiến ${name} thật tự hào.`,
    `Con đường này đi qua những ước mơ nhỏ ${name} từng tin là thật.`,
    `Bốn mảnh ký ức đầu đã sáng. Món quà riêng của ${name} đang ở phía sau cổng.`,
  ];

  const zones = DEFAULT_PIXEL_QUEST.zones.map((zone, index) => ({
    ...zone,
    title: stations[index]?.title.trim() || zone.title,
    npcLine: stations[index]?.npcLine.trim() || lines[index] || zone.npcLine,
  }));

  return {
    ...DEFAULT_PIXEL_QUEST,
    zones,
    quests: DEFAULT_PIXEL_QUEST.quests.map((quest, index) => ({
      ...quest,
      nodeId: zones[index]?.id ?? quest.nodeId,
      type: stations[index]?.questType ?? quest.type,
      title: stations[index]?.questTitle.trim() || quest.title,
      prompt: stations[index]?.questPrompt.trim() || quest.prompt,
      targetLabel: stations[index]?.questTargetLabel.trim() || quest.targetLabel,
      completionLine: stations[index]?.questCompletionLine.trim() || quest.completionLine,
    })),
    npcs: zones.map((zone, index) => {
      const station = stations[index];
      const fallback = DEFAULT_PIXEL_QUEST.npcs[index]
        ?? DEFAULT_PIXEL_QUEST.npcs[index % DEFAULT_PIXEL_QUEST.npcs.length];
      return {
        id: fallback?.id ?? `npc-${zone.id}`,
        nodeId: zone.id,
        name: station?.npcName.trim() || fallback?.name || "Người giữ cổng",
        role: station?.npcRole.trim() || fallback?.role || "Người dẫn đường",
        line: station?.npcLine.trim() || lines[index] || zone.npcLine,
        archetype: fallback?.archetype ?? "guide",
      };
    }),
  };
}

function recipientSeed(index: number, name: string, role: string): EditableRecipient {
  const tones = ["pear", "cyan", "coral"] as const;
  return {
    clientId: `recipient-${index}`,
    displayName: name,
    relationLabel: role,
    birthdayDate: `199${index + 3}-08-${String(index * 8 + 5).padStart(2, "0")}`,
    avatarUrl: "",
    childhoodPhotos: DEFAULT_PIXEL_QUEST.zones.map((zone, stationIndex) => {
      const quest = DEFAULT_PIXEL_QUEST.quests[stationIndex]!;
      const npc = DEFAULT_PIXEL_QUEST.npcs[stationIndex]
        ?? DEFAULT_PIXEL_QUEST.npcs[stationIndex % DEFAULT_PIXEL_QUEST.npcs.length];
      return {
        url: "",
        caption: "",
        title: zone.title,
        npcName: npc?.name ?? "Người giữ cổng",
        npcRole: npc?.role ?? "Người dẫn đường",
        npcLine: zone.npcLine,
        questType: quest.type,
        questTitle: quest.title,
        questPrompt: quest.prompt,
        questTargetLabel: quest.targetLabel,
        questCompletionLine: quest.completionLine,
      };
    }),
    accent: tones[(index - 1) % tones.length],
    character: index % 2 === 0 ? "Người dẫn đường bình tĩnh" : "Người giữ nhịp ấm áp",
    childCharacterName: `Bé ${name}`,
    childCharacterTrait: index % 2 === 0
      ? "Tò mò, nhanh trí và thích tìm lối mới"
      : "Ấm áp, tinh nghịch và luôn nhặt lại những điều đáng nhớ",
    childCharacterArchetype: (["princess", "prince", "emperor", "knight"] as const)[(index - 1) % 4],
    chapters: chapterSet(name, role),
    messageSender: "Đội dự án",
    messageBody: `Chúc mừng sinh nhật ${name}. Cảm ơn bạn vì ${role.toLowerCase()} trong những ngày nhiều việc.`,
    consentStatus: "approved",
    voucherTitle: index % 2 === 0 ? "Voucher ăn trưa cùng đội" : "Phiếu cà phê sáng",
    voucherDescription: `Một món quà nhỏ dành riêng cho ${name}.`,
    voucherCode: `${toBirthdaySlug(name).toUpperCase()}-THANG-8`,
    voucherHint: "Mã dùng một lần sau khi máy chủ xác nhận đủ năm trạm ký ức",
    voucherTerms: "Dùng một lần, ưu tiên lịch của người nhận.",
    voucherExpiresAt: "",
  };
}

function toBangkokIso(date: string) {
  return date ? new Date(`${date}T00:00:00+07:00`).toISOString() : null;
}

function isHttpsUrl(value: string) {
  if (!value.trim()) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {} as Record<string, unknown>;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function apiMessage(data: Record<string, unknown>, fallback: string) {
  return apiErrorMessage(data, fallback);
}

export function AdminCampaignStudio() {
  const supabase = useMemo(
    () => (supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null),
    [],
  );
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId);
  const [email, setEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<ApiStatus>("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [step, setStep] = useState(0);
  const [activeRecipient, setActiveRecipient] = useState(0);
  const [saveStatus, setSaveStatus] = useState<ApiStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [savedCampaignId, setSavedCampaignId] = useState("");
  const [publishedLink, setPublishedLink] = useState("");
  const [analytics, setAnalytics] = useState<AdminCampaignAnalyticsResult | null>(null);
  const [analyticsStatus, setAnalyticsStatus] = useState<ApiStatus>("idle");
  const [analyticsMessage, setAnalyticsMessage] = useState("");
  const [campaign, setCampaign] = useState({
    title: "Tháng 8 rực rỡ",
    subtitle: "Năm trạm ký ức dành riêng cho đồng đội tháng 8",
    slug: "thang-8-ruc-ro",
    startsAt: new Date().toISOString().slice(0, 10),
    endsAt: "",
  });
  const [recipients, setRecipients] = useState<EditableRecipient[]>([
    recipientSeed(1, "Mai", "Người giữ nhịp dự án"),
    recipientSeed(2, "Quân", "Người gỡ việc khó"),
  ]);

  const verifySession = useCallback(
    async (session: Session | null) => {
      if (!session?.access_token || !workspaceId) {
        setAccessToken("");
        setAdmin(null);
        return;
      }

      setAuthStatus("loading");
      const response = await fetch(
        `/api/admin/me?workspaceId=${encodeURIComponent(workspaceId)}`,
        { headers: { authorization: `Bearer ${session.access_token}` } },
      );
      const data = await readJson(response);

      if (!response.ok) {
        setAccessToken("");
        setAdmin(null);
        setAuthStatus("error");
        setAuthMessage(apiMessage(data, "Tài khoản chưa có quyền trong workspace này."));
        return;
      }

      const identity = data.admin as AdminIdentity;
      setAccessToken(session.access_token);
      setAdmin(identity);
      setEmail(identity.email);
      setAuthStatus("success");
      setAuthMessage(`Đã xác thực ${identity.email} với quyền ${identity.role}.`);
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!supabase) return;

    void supabase.auth.getSession().then(({ data }) => verifySession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      void verifySession(session);
    });

    return () => data.subscription.unsubscribe();
  }, [supabase, verifySession]);

  useEffect(() => {
    if (!savedCampaignId || !accessToken || !workspaceId) {
      return;
    }

    let cancelled = false;

    async function loadAnalytics() {
      setAnalyticsStatus("loading");
      const response = await fetch(
        `/api/admin/campaigns/${savedCampaignId}/analytics?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
            "x-workspace-id": workspaceId,
          },
        },
      );
      const data = await readJson(response);

      if (cancelled) return;
      if (!response.ok) {
        setAnalyticsStatus("error");
        setAnalyticsMessage(apiMessage(data, "Không tải được trạng thái người chơi."));
        return;
      }

      setAnalytics(data.analytics as AdminCampaignAnalyticsResult);
      setAnalyticsStatus("success");
      setAnalyticsMessage("");
    }

    void loadAnalytics();
    const timer = window.setInterval(() => void loadAnalytics(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [accessToken, savedCampaignId, workspaceId]);

  const currentRecipient = recipients[activeRecipient] ?? recipients[0];

  function updateRecipient(patch: Partial<EditableRecipient>) {
    setRecipients((current) =>
      current.map((recipient, index) =>
        index === activeRecipient ? { ...recipient, ...patch } : recipient,
      ),
    );
  }

  function updateChapter(chapterIndex: number, patch: Partial<EditableChapter>) {
    updateRecipient({
      chapters: currentRecipient.chapters.map((chapter, index) =>
        index === chapterIndex ? { ...chapter, ...patch } : chapter,
      ),
    });
  }

  function updateChildhoodPhoto(
    photoIndex: number,
    patch: Partial<EditableMemoryPhoto>,
  ) {
    updateRecipient({
      childhoodPhotos: currentRecipient.childhoodPhotos.map((photo, index) =>
        index === photoIndex ? { ...photo, ...patch } : photo,
      ),
    });
  }

  function addRecipient() {
    if (recipients.length >= 5) return;
    const index = recipients.length + 1;
    const next = recipientSeed(index, `Đồng đội ${index}`, "Người tạo dấu ấn riêng");
    next.clientId = `recipient-${index}-${Date.now()}`;
    setRecipients((current) => [...current, next]);
    setActiveRecipient(recipients.length);
  }

  function removeRecipient(index: number) {
    if (recipients.length <= 2) return;
    setRecipients((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setActiveRecipient((current) => Math.max(0, Math.min(current, recipients.length - 2)));
  }

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthStatus("loading");
    setAuthMessage("");

    const response = await fetch("/api/admin/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim(), redirectTo: `${window.location.origin}/admin` }),
    });
    const data = await readJson(response);

    if (!response.ok) {
      setAuthStatus("error");
      setAuthMessage(apiMessage(data, "Không gửi được magic link. Kiểm tra cấu hình Supabase."));
      return;
    }

    setAuthStatus("success");
    setAuthMessage("Magic link đã gửi. Mở email trên thiết bị này để hoàn tất đăng nhập.");
  }

  async function signOut() {
    await supabase?.auth.signOut();
    setAccessToken("");
    setAdmin(null);
    setAuthStatus("idle");
    setAuthMessage("");
  }

  async function adminFetch(path: string, init: RequestInit) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("x-workspace-id", workspaceId);
    if (init.body) headers.set("content-type", "application/json");

    const response = await fetch(path, { ...init, headers });
    const data = await readJson(response);
    if (!response.ok) throw new Error(apiMessage(data, `API ${response.status}`));
    return data;
  }

  function validateForSave(publish: boolean) {
    if (!admin || !accessToken) return "Admin chưa được xác thực.";
    if (!campaign.title.trim() || !campaign.slug.trim()) return "Tên và slug chiến dịch là bắt buộc.";
    if (recipients.length < 2 || recipients.length > 5) return "Chiến dịch cần từ 2 đến 5 người nhận.";

    for (const recipient of recipients) {
      if (!recipient.displayName.trim() || !recipient.birthdayDate) {
        return "Mỗi người cần tên và ngày sinh tháng 8.";
      }
      if (!recipient.birthdayDate.includes("-08-")) return `${recipient.displayName} chưa có sinh nhật tháng 8.`;
      if (recipient.childhoodPhotos.some((photo) => !isHttpsUrl(photo.url))) {
        return `Album tuổi thơ của ${recipient.displayName} chỉ nhận URL HTTPS hợp lệ.`;
      }
      if (recipient.childhoodPhotos.length !== 5 || recipient.childhoodPhotos.some((station) => (
        !station.title.trim()
        || !station.npcName.trim()
        || !station.npcLine.trim()
        || !station.questTitle.trim()
        || !station.questPrompt.trim()
        || !station.questTargetLabel.trim()
        || !station.questCompletionLine.trim()
      ))) {
        return `${recipient.displayName} cần đủ nội dung NPC và nhiệm vụ cho năm trạm.`;
      }
      if (recipient.chapters.length !== 4 || recipient.chapters.some((chapter) => chapter.options.length < 1)) {
        return `${recipient.displayName} cần đủ bốn chương nội dung và mốc tiến trình nội bộ.`;
      }
      if (!recipient.voucherCode.trim() || !recipient.voucherTitle.trim()) {
        return `${recipient.displayName} chưa có mã voucher.`;
      }
      if (publish && recipient.consentStatus !== "approved") {
        return `Lời nhắn của ${recipient.displayName} chưa được đồng ý sử dụng.`;
      }
    }

    return "";
  }

  async function saveCampaign(publish: boolean) {
    const validation = validateForSave(publish);
    if (validation) {
      setSaveStatus("error");
      setSaveMessage(validation);
      return;
    }

    setSaveStatus("loading");
    setSaveMessage("");

    try {
      let campaignId = savedCampaignId;
      if (!campaignId) {
        const data = await adminFetch("/api/admin/campaigns", {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            slug: toBirthdaySlug(campaign.slug),
            title: campaign.title.trim(),
            subtitle: campaign.subtitle.trim() || null,
            locale: "vi-VN",
            timezone: "Asia/Bangkok",
            status: "draft",
            startsAt: toBangkokIso(campaign.startsAt),
            endsAt: toBangkokIso(campaign.endsAt),
            theme: { name: "hum", palette: "cream-pear-cyan-coral" },
            settings: {
              audioDefault: false,
              trustModel: "recipient_picker",
              worldPreset: "childhood-memory-atlas",
              worldVersion: 3,
            },
          }),
        });
        campaignId = (data.campaign as { id: string }).id;
        setSavedCampaignId(campaignId);

        for (const recipient of recipients) {
          const memoryImages = recipient.childhoodPhotos
            .filter((photo) => photo.url.trim())
            .slice(0, 5)
            .map((photo, index) => ({
              url: photo.url.trim(),
              alt: `Ảnh tuổi thơ ${index + 1} của ${recipient.displayName.trim() || "người nhận"}`,
              caption: photo.caption.trim(),
            }));
          const visibleMessage =
            recipient.consentStatus === "approved"
              ? `“${recipient.messageBody}” - ${recipient.messageSender}`
              : "Lời nhắn đang chờ đồng ý sử dụng.";
          const pixelQuest = pixelQuestToJson(
            memoryMapFor(recipient.displayName, recipient.childhoodPhotos),
          );
          const chapters = recipient.chapters.map((chapter) => ({
            ...chapter,
            body: chapter.orderIndex === 3 ? `${chapter.body}\n\n${visibleMessage}` : chapter.body,
            isPublished: true,
            metadata: {
              gameType: chapter.gameType,
              estimatedSeconds: 75,
              noFailPath: true,
              memoryImages: chapter.orderIndex === 1 ? memoryImages : [],
              pixelQuest,
            },
          }));

          await adminFetch(`/api/admin/campaigns/${campaignId}/recipients`, {
            method: "POST",
            body: JSON.stringify({
              workspaceId,
              slug: toBirthdaySlug(recipient.displayName),
              displayName: recipient.displayName.trim(),
              relationLabel: recipient.relationLabel.trim() || null,
              birthdayDate: recipient.birthdayDate,
              avatarUrl: recipient.avatarUrl.trim() || null,
              status: "active",
              metadata: {
                accent: recipient.accent,
                character: recipient.character,
                childCharacterName: recipient.childCharacterName.trim(),
                childCharacterTrait: recipient.childCharacterTrait.trim(),
                childCharacterArchetype: recipient.childCharacterArchetype,
                consentReviewed: recipient.consentStatus === "approved",
              },
              chapters,
              messages: [
                {
                  senderLabel: recipient.messageSender.trim(),
                  body: recipient.messageBody.trim(),
                  consentStatus: recipient.consentStatus,
                  revealAfterOrder: 3,
                  metadata: { workplaceSafe: true },
                },
              ],
              voucher: {
                title: recipient.voucherTitle.trim(),
                description: recipient.voucherDescription.trim() || null,
                code: recipient.voucherCode.trim(),
                codeHint: recipient.voucherHint.trim() || null,
                terms: recipient.voucherTerms.trim() || null,
                expiresAt: toBangkokIso(recipient.voucherExpiresAt),
                metadata: { singleUse: true },
              },
            }),
          });
        }
      }

      if (publish) {
        await adminFetch(`/api/admin/campaigns/${campaignId}`, {
          method: "PATCH",
          body: JSON.stringify({ workspaceId, status: "published" }),
        });
        const link = `${window.location.origin}/birthday/${toBirthdaySlug(campaign.slug)}`;
        setPublishedLink(link);
        setSaveMessage("Chiến dịch đã xuất bản. Link chung sẵn sàng để chia sẻ nội bộ.");
      } else {
        setSaveMessage("Đã lưu chiến dịch ở trạng thái draft cùng toàn bộ người nhận.");
      }
      setSaveStatus("success");
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error
          ? `${error.message}. Nếu lỗi xảy ra giữa chừng, campaign vẫn được giữ ở draft.`
          : "Không lưu được chiến dịch.",
      );
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-login-panel" aria-labelledby="admin-title">
        <div>
          <p className="eyebrow">Birthday Game Studio</p>
          <h1 id="admin-title">Thiết kế một Farm RPG riêng cho từng người</h1>
          <p>Chỉnh nhân vật, năm trạm, NPC, nhiệm vụ, ảnh ký ức và voucher trong một luồng xuất bản.</p>
        </div>

        <form className="admin-login-form" onSubmit={requestMagicLink}>
          <label htmlFor="workspace-id">Workspace ID</label>
          <input
            id="workspace-id"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
            aria-required="true"
          />
          <label htmlFor="admin-email">Email admin</label>
          <div className="name-field-row">
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@congty.vn"
              autoComplete="email"
              aria-required="true"
            />
            <button
              type="submit"
              aria-busy={authStatus === "loading"}
              disabled={!supabase || authStatus === "loading" || !email.trim()}
            >
              {authStatus === "loading" ? (
                <Loader2 className="spin-icon" size={18} aria-hidden="true" />
              ) : (
                <Mail size={18} aria-hidden="true" />
              )}
              <span>Gửi magic link</span>
            </button>
          </div>
        </form>

        {!supabase ? (
          <p className="api-message is-warning" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>Thiếu `NEXT_PUBLIC_SUPABASE_URL` hoặc `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Wizard vẫn khoá.</span>
          </p>
        ) : null}
        {authMessage ? (
          <p className={`api-message ${authStatus === "error" ? "is-error" : "is-success"}`} role={authStatus === "error" ? "alert" : "status"}>
            {authStatus === "error" ? (
              <AlertCircle size={18} aria-hidden="true" />
            ) : (
              <Check size={18} aria-hidden="true" />
            )}
            <span>{authMessage}</span>
          </p>
        ) : null}
        {admin ? (
          <button type="button" className="ghost-button" onClick={signOut}>
            <LogOut size={18} aria-hidden="true" />
            <span>Đăng xuất</span>
          </button>
        ) : null}
      </section>

      {!admin ? (
        <section className="wizard-empty" aria-live="polite">
          <Lock size={22} aria-hidden="true" />
          <p>Đăng nhập bằng magic link và có quyền owner, admin hoặc editor để mở wizard.</p>
        </section>
      ) : (
        <>
          <section className="wizard-shell" aria-labelledby="wizard-title">
          <aside className="wizard-steps">
            <p className="eyebrow">Game Studio tháng 8</p>
            <h2 id="wizard-title">Birthday Game Studio</h2>
            <ol>
              {ADMIN_STEPS.map((label, index) => (
                <li key={label} className={step === index ? "is-current" : ""}>
                  <button type="button" onClick={() => setStep(index)}>
                    <span>{index + 1}</span>
                    <strong>{label}</strong>
                  </button>
                </li>
              ))}
            </ol>
          </aside>

          <section className="wizard-editor" aria-live="polite">
            {step === 0 ? (
              <fieldset className="form-panel">
                <legend>Link chung</legend>
                <label htmlFor="campaign-title">Tên chiến dịch</label>
                <input id="campaign-title" value={campaign.title} onChange={(event) => setCampaign((current) => ({ ...current, title: event.target.value }))} />
                <label htmlFor="campaign-subtitle">Dòng giới thiệu</label>
                <input id="campaign-subtitle" value={campaign.subtitle} onChange={(event) => setCampaign((current) => ({ ...current, subtitle: event.target.value }))} />
                <label htmlFor="campaign-slug">Slug link chung</label>
                <input id="campaign-slug" value={campaign.slug} onChange={(event) => setCampaign((current) => ({ ...current, slug: toBirthdaySlug(event.target.value) }))} />
                <label htmlFor="campaign-start">Ngày mở</label>
                <input id="campaign-start" type="date" value={campaign.startsAt} onChange={(event) => setCampaign((current) => ({ ...current, startsAt: event.target.value }))} />
                <label htmlFor="campaign-end">Ngày đóng, nếu có</label>
                <input id="campaign-end" type="date" value={campaign.endsAt} onChange={(event) => setCampaign((current) => ({ ...current, endsAt: event.target.value }))} />
              </fieldset>
            ) : null}

            {step === 1 ? (
              <div className="recipient-editor">
                <div className="recipient-tabs" role="tablist" aria-label="Người nhận">
                  {recipients.map((recipient, index) => (
                    <button type="button" role="tab" aria-selected={activeRecipient === index} className={activeRecipient === index ? "is-selected" : "ghost-button"} key={recipient.clientId} onClick={() => setActiveRecipient(index)}>
                      {recipient.displayName || `Người ${index + 1}`}
                    </button>
                  ))}
                  <button type="button" className="ghost-button" onClick={addRecipient} disabled={recipients.length >= 5}>
                    <Plus size={18} aria-hidden="true" />
                    <span>Thêm người</span>
                  </button>
                </div>
                <fieldset className="form-panel">
                  <legend>Hồ sơ cá nhân</legend>
                  <label htmlFor="recipient-name">Tên hiển thị</label>
                  <input id="recipient-name" value={currentRecipient.displayName} onChange={(event) => updateRecipient({ displayName: event.target.value })} />
                  <label htmlFor="recipient-role">Chi tiết cá nhân thứ nhất: vai trò quen thuộc</label>
                  <input id="recipient-role" value={currentRecipient.relationLabel} onChange={(event) => updateRecipient({ relationLabel: event.target.value })} />
                  <label htmlFor="recipient-character">Chi tiết cá nhân thứ hai: nhân vật đồng hành</label>
                  <input id="recipient-character" value={currentRecipient.character} onChange={(event) => updateRecipient({ character: event.target.value })} />
                  <label htmlFor="recipient-child-character-name">Tên nhân vật nhí trên bản đồ</label>
                  <input id="recipient-child-character-name" value={currentRecipient.childCharacterName} placeholder={`Bé ${currentRecipient.displayName || "Tên"}`} onChange={(event) => updateRecipient({ childCharacterName: event.target.value })} />
                  <label htmlFor="recipient-child-character-trait">Tính cách tuổi thơ</label>
                  <input id="recipient-child-character-trait" value={currentRecipient.childCharacterTrait} placeholder="Tò mò, thích khám phá" onChange={(event) => updateRecipient({ childCharacterTrait: event.target.value })} />
                  <label htmlFor="recipient-child-character-archetype">Vai nhân vật pixel</label>
                  <select id="recipient-child-character-archetype" value={currentRecipient.childCharacterArchetype} onChange={(event) => updateRecipient({ childCharacterArchetype: event.target.value as PixelCharacterArchetype })}>
                    {Object.entries(PIXEL_CHARACTER_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  <label htmlFor="recipient-birthday">Ngày sinh tháng 8</label>
                  <input id="recipient-birthday" type="date" value={currentRecipient.birthdayDate} onChange={(event) => updateRecipient({ birthdayDate: event.target.value })} />
                  <label htmlFor="recipient-avatar">URL ảnh đã được đồng ý sử dụng</label>
                  <input id="recipient-avatar" type="url" value={currentRecipient.avatarUrl} placeholder="https://..." onChange={(event) => updateRecipient({ avatarUrl: event.target.value })} />
                  <section className="childhood-photo-editor" aria-labelledby="childhood-photo-title">
                    <div className="childhood-photo-editor__intro">
                      <div>
                        <h3 id="childhood-photo-title">Album tuổi thơ</h3>
                        <p>Năm ảnh sẽ nằm tại năm trạm trên bản đồ tuổi thơ của riêng người nhận.</p>
                      </div>
                      <span>Ảnh riêng của {currentRecipient.displayName || "người nhận"}</span>
                    </div>
                    <div className="childhood-photo-list">
                      {currentRecipient.childhoodPhotos.map((photo, photoIndex) => {
                        const previewUrl = isHttpsUrl(photo.url) && photo.url.trim() ? photo.url.trim() : "";
                        return (
                          <div className="childhood-photo-row" key={`childhood-photo-${photoIndex + 1}`}>
                            <div className="childhood-photo-preview" aria-hidden="true">
                              {previewUrl ? (
                                <Image
                                  src={previewUrl}
                                  alt=""
                                  width={144}
                                  height={112}
                                  unoptimized
                                />
                              ) : (
                                <span>Ảnh {String(photoIndex + 1).padStart(2, "0")}</span>
                              )}
                            </div>
                            <div className="childhood-photo-fields">
                              <label htmlFor={`childhood-photo-url-${photoIndex}`}>
                                URL ảnh {photoIndex + 1}
                              </label>
                              <input
                                id={`childhood-photo-url-${photoIndex}`}
                                type="url"
                                inputMode="url"
                                value={photo.url}
                                placeholder="https://..."
                                aria-invalid={!isHttpsUrl(photo.url)}
                                aria-describedby={`childhood-photo-helper-${photoIndex}`}
                                onChange={(event) => updateChildhoodPhoto(photoIndex, { url: event.target.value })}
                              />
                              <small
                                id={`childhood-photo-helper-${photoIndex}`}
                                className={!isHttpsUrl(photo.url) ? "childhood-photo-helper is-error" : "childhood-photo-helper"}
                              >
                                {!isHttpsUrl(photo.url) ? "URL cần bắt đầu bằng https://" : "Dùng ảnh ngang hoặc vuông, tối thiểu 720 px."}
                              </small>
                              <label htmlFor={`childhood-photo-caption-${photoIndex}`}>
                                Chú thích ngắn
                              </label>
                              <input
                                id={`childhood-photo-caption-${photoIndex}`}
                                value={photo.caption}
                                maxLength={240}
                                placeholder="Ví dụ: Mùa hè và chiếc xe đạp đầu tiên"
                                onChange={(event) => updateChildhoodPhoto(photoIndex, { caption: event.target.value })}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="privacy-note">
                      Chỉ dùng ảnh đã được người nhận hoặc gia đình đồng ý. Tránh ảnh chứa thông tin sức khỏe, xung đột gia đình hoặc dữ liệu nhạy cảm.
                    </p>
                  </section>
                  <label htmlFor="recipient-accent">Màu nhấn</label>
                  <select id="recipient-accent" value={currentRecipient.accent} onChange={(event) => updateRecipient({ accent: event.target.value as EditableRecipient["accent"] })}>
                    <option value="pear">Pear</option>
                    <option value="cyan">Cyan</option>
                    <option value="coral">Coral</option>
                  </select>
                  <button type="button" className="ghost-button" onClick={() => removeRecipient(activeRecipient)} disabled={recipients.length <= 2}>
                    <Trash2 size={18} aria-hidden="true" />
                    <span>Xoá người này</span>
                  </button>
                </fieldset>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="chapter-plan">
                <h3>Năm trạm ký ức của {currentRecipient.displayName}</h3>
                <p className="privacy-note">Layout Farm cố định. Mỗi trạm đổi câu chuyện, NPC, nhiệm vụ và ảnh; không có quiz hoặc nhánh thất bại.</p>
                {currentRecipient.childhoodPhotos.map((station, stationIndex) => {
                  const chapter = currentRecipient.chapters[stationIndex];
                  const stationNumber = stationIndex + 1;
                  return (
                    <fieldset className="form-panel memory-station-editor" key={`memory-station-${stationNumber}`}>
                      <legend>Trạm {stationNumber}: {station.title}</legend>
                      <small className="chapter-kind">{stationIndex < 4 ? `${CHAPTER_GAME_LABELS[chapter!.gameType]} · khoảng 1 phút` : "Cổng cuối · server xác nhận trước khi mở voucher"}</small>

                      <label htmlFor={`station-title-${stationNumber}`}>Tên khu vực</label>
                      <input id={`station-title-${stationNumber}`} value={station.title} onChange={(event) => updateChildhoodPhoto(stationIndex, { title: event.target.value })} />

                      <div className="memory-station-editor__grid">
                        <div>
                          <label htmlFor={`station-npc-name-${stationNumber}`}>Tên NPC</label>
                          <input id={`station-npc-name-${stationNumber}`} value={station.npcName} onChange={(event) => updateChildhoodPhoto(stationIndex, { npcName: event.target.value })} />
                        </div>
                        <div>
                          <label htmlFor={`station-npc-role-${stationNumber}`}>Vai trò NPC</label>
                          <input id={`station-npc-role-${stationNumber}`} value={station.npcRole} onChange={(event) => updateChildhoodPhoto(stationIndex, { npcRole: event.target.value })} />
                        </div>
                      </div>
                      <label htmlFor={`station-npc-line-${stationNumber}`}>Lời thoại trong world</label>
                      <textarea id={`station-npc-line-${stationNumber}`} value={station.npcLine} maxLength={180} onChange={(event) => updateChildhoodPhoto(stationIndex, { npcLine: event.target.value })} />

                      <label htmlFor={`station-quest-type-${stationNumber}`}>Loại nhiệm vụ môi trường</label>
                      <select id={`station-quest-type-${stationNumber}`} value={station.questType} onChange={(event) => updateChildhoodPhoto(stationIndex, { questType: event.target.value as MemoryQuestType })}>
                        <option value="collect">Nhặt mảnh ký ức</option>
                        <option value="talk">Nói chuyện với NPC</option>
                        <option value="activate">Kích hoạt vật thể</option>
                        <option value="deliver">Đưa vật phẩm</option>
                        <option value="story">Mở nút kể chuyện</option>
                      </select>
                      <label htmlFor={`station-quest-title-${stationNumber}`}>Tên nhiệm vụ</label>
                      <input id={`station-quest-title-${stationNumber}`} value={station.questTitle} onChange={(event) => updateChildhoodPhoto(stationIndex, { questTitle: event.target.value })} />
                      <label htmlFor={`station-quest-prompt-${stationNumber}`}>Hướng dẫn người chơi</label>
                      <input id={`station-quest-prompt-${stationNumber}`} value={station.questPrompt} onChange={(event) => updateChildhoodPhoto(stationIndex, { questPrompt: event.target.value })} />
                      <label htmlFor={`station-quest-target-${stationNumber}`}>Tên vật thể mục tiêu</label>
                      <input id={`station-quest-target-${stationNumber}`} value={station.questTargetLabel} onChange={(event) => updateChildhoodPhoto(stationIndex, { questTargetLabel: event.target.value })} />
                      <label htmlFor={`station-quest-complete-${stationNumber}`}>Dòng hoàn thành</label>
                      <input id={`station-quest-complete-${stationNumber}`} value={station.questCompletionLine} onChange={(event) => updateChildhoodPhoto(stationIndex, { questCompletionLine: event.target.value })} />

                      {chapter ? (
                        <>
                          <label htmlFor={`chapter-body-${chapter.orderIndex}`}>Đoạn kể ký ức cá nhân</label>
                          <textarea id={`chapter-body-${chapter.orderIndex}`} value={chapter.body} onChange={(event) => updateChapter(stationIndex, { body: event.target.value, title: station.title, prompt: station.questPrompt })} />
                        </>
                      ) : null}

                      <label htmlFor={`station-photo-url-${stationNumber}`}>URL ảnh ký ức</label>
                      <input id={`station-photo-url-${stationNumber}`} type="url" value={station.url} placeholder="https://..." aria-invalid={!isHttpsUrl(station.url)} onChange={(event) => updateChildhoodPhoto(stationIndex, { url: event.target.value })} />
                      <label htmlFor={`station-photo-caption-${stationNumber}`}>Caption ảnh</label>
                      <input id={`station-photo-caption-${stationNumber}`} value={station.caption} maxLength={240} onChange={(event) => updateChildhoodPhoto(stationIndex, { caption: event.target.value })} />
                    </fieldset>
                  );
                })}
              </div>
            ) : null}

            {step === 3 ? (
              <fieldset className="form-panel">
                <legend>Lời nhắn cho {currentRecipient.displayName}</legend>
                <label htmlFor="message-sender">Người gửi</label>
                <input id="message-sender" value={currentRecipient.messageSender} onChange={(event) => updateRecipient({ messageSender: event.target.value })} />
                <label htmlFor="message-body">Nội dung an toàn tại nơi làm việc</label>
                <textarea id="message-body" value={currentRecipient.messageBody} onChange={(event) => updateRecipient({ messageBody: event.target.value })} />
                <label htmlFor="message-consent">Trạng thái đồng ý sử dụng</label>
                <select id="message-consent" value={currentRecipient.consentStatus} onChange={(event) => updateRecipient({ consentStatus: event.target.value as EditableRecipient["consentStatus"] })}>
                  <option value="approved">Đã đồng ý</option>
                  <option value="pending">Đang chờ</option>
                  <option value="revoked">Đã thu hồi</option>
                </select>
              </fieldset>
            ) : null}

            {step === 4 ? (
              <fieldset className="form-panel">
                <legend>Voucher của {currentRecipient.displayName}</legend>
                <label htmlFor="voucher-title">Tên voucher</label>
                <input id="voucher-title" value={currentRecipient.voucherTitle} onChange={(event) => updateRecipient({ voucherTitle: event.target.value })} />
                <label htmlFor="voucher-code">Mã hoặc URL bí mật</label>
                <input id="voucher-code" value={currentRecipient.voucherCode} onChange={(event) => updateRecipient({ voucherCode: event.target.value })} autoComplete="off" />
                <label htmlFor="voucher-description">Mô tả</label>
                <textarea id="voucher-description" value={currentRecipient.voucherDescription} onChange={(event) => updateRecipient({ voucherDescription: event.target.value })} />
                <label htmlFor="voucher-hint">Gợi ý trước khi mở</label>
                <input id="voucher-hint" value={currentRecipient.voucherHint} onChange={(event) => updateRecipient({ voucherHint: event.target.value })} />
                <label htmlFor="voucher-terms">Điều kiện sử dụng</label>
                <input id="voucher-terms" value={currentRecipient.voucherTerms} onChange={(event) => updateRecipient({ voucherTerms: event.target.value })} />
                <label htmlFor="voucher-expiry">Hạn dùng, nếu có</label>
                <input id="voucher-expiry" type="date" value={currentRecipient.voucherExpiresAt} onChange={(event) => updateRecipient({ voucherExpiresAt: event.target.value })} />
              </fieldset>
            ) : null}

            {step === 5 ? (
              <div className="publish-panel">
                <h3>Kiểm tra trước khi xuất bản</h3>
                <dl>
                  <div><dt>Link</dt><dd>/birthday/{toBirthdaySlug(campaign.slug)}</dd></div>
                  <div><dt>Người nhận</dt><dd>{recipients.length}</dd></div>
                  <div><dt>Mỗi hành trình</dt><dd>5 trạm, 4 chương nội dung, không có nhánh thất bại</dd></div>
                  <div><dt>Timezone</dt><dd>Asia/Bangkok</dd></div>
                </dl>
                {saveMessage ? (
                  <p className={`api-message ${saveStatus === "error" ? "is-error" : "is-success"}`} role={saveStatus === "error" ? "alert" : "status"}>
                    {saveStatus === "error" ? (
                      <AlertCircle size={18} aria-hidden="true" />
                    ) : (
                      <Check size={18} aria-hidden="true" />
                    )}
                    <span>{saveMessage}</span>
                  </p>
                ) : null}
                {publishedLink ? <Link className="primary-cta" href={publishedLink}>Mở link đã xuất bản</Link> : null}
                <div className="chapter-actions">
                  <button type="button" className="ghost-button" onClick={() => saveCampaign(false)} disabled={saveStatus === "loading"}>
                    <Save size={18} aria-hidden="true" />
                    <span>Lưu draft</span>
                  </button>
                  <button
                    type="button"
                    aria-busy={saveStatus === "loading"}
                    onClick={() => saveCampaign(true)}
                    disabled={saveStatus === "loading"}
                  >
                    {saveStatus === "loading" ? (
                      <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                    ) : (
                      <Send size={18} aria-hidden="true" />
                    )}
                    <span>Xuất bản</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="wizard-next-row">
              <button type="button" onClick={() => setStep((current) => Math.min(current + 1, ADMIN_STEPS.length - 1))} disabled={step === ADMIN_STEPS.length - 1}>
                <span>Tiếp</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </section>

          <aside className="campaign-preview" aria-label="Bản xem trước">
            <span className={`initial-badge tone-${currentRecipient.accent}`}>{initialsFromName(currentRecipient.displayName)}</span>
            <p className="eyebrow">Preview cá nhân</p>
            <h2>{currentRecipient.displayName}</h2>
            <p>{currentRecipient.relationLabel}</p>
            <p>{currentRecipient.character}</p>
            <div className={`admin-child-character tone-${currentRecipient.accent}`} aria-label={`Nhân vật ${currentRecipient.childCharacterName}`}>
              <span aria-hidden="true">{initialsFromName(currentRecipient.displayName).slice(0, 1)}</span>
              <div>
                <strong>{currentRecipient.childCharacterName || `Bé ${currentRecipient.displayName}`}</strong>
                <small>{PIXEL_CHARACTER_LABELS[currentRecipient.childCharacterArchetype]}</small>
                <small>{currentRecipient.childCharacterTrait}</small>
              </div>
            </div>
            <small>{currentRecipient.chapters[1]?.body}</small>
            <small>Voucher: {currentRecipient.voucherTitle}</small>
          </aside>
          </section>

          {savedCampaignId ? (
            <section className="analytics-panel" aria-labelledby="analytics-title">
              <header className="analytics-head">
                <div>
                  <p className="eyebrow">Trạng thái chiến dịch</p>
                  <h2 id="analytics-title">Theo dõi hành trình</h2>
                </div>
              <small>Realtime từ server · tự làm mới mỗi 60 giây · Asia/Bangkok</small>
              </header>

              {analyticsStatus === "error" ? (
                <p className="api-message is-error" role="alert">
                  <AlertCircle size={18} aria-hidden="true" />
                  <span>{analyticsMessage}</span>
                </p>
              ) : null}

              {analytics ? (
                <>
                  <dl className="metric-strip">
                    <div><dt>Bắt đầu</dt><dd>{analytics.totals.sessionsStarted}</dd></div>
                    <div><dt>Hoàn thành</dt><dd>{formatPercent(analytics.totals.completionRate)}</dd></div>
                    <div><dt>Mở voucher</dt><dd>{formatPercent(analytics.totals.voucherRevealRate)}</dd></div>
                    <div><dt>Thời lượng TB</dt><dd>{formatDuration(analytics.totals.averageDurationMs)}</dd></div>
                    <div><dt>Thử lại quest</dt><dd>{formatPercent(analytics.totals.questRetryRate)}</dd></div>
                    <div><dt>Quay lại trạm</dt><dd>{formatPercent(analytics.totals.revisitRate)}</dd></div>
                  </dl>

                  <div className="recipient-status-list">
                    {analytics.recipients.map((recipient) => (
                      <div className="recipient-status-row" key={recipient.recipientId}>
                        <strong>{recipient.displayName}</strong>
                        <span data-status={recipient.status}>{PLAY_STATUS_LABELS[recipient.status]}</span>
                        <small>{recipient.sessionsStarted} phiên</small>
                      </div>
                    ))}
                  </div>

                  <div className="dropoff-list" aria-label="Rời bỏ theo chương">
                    {analytics.chapterDropOff.map((chapter) => (
                      <div key={chapter.chapterOrder}>
                        <span>Chương {chapter.chapterOrder}</span>
                        <strong>{formatPercent(chapter.dropOffRate)}</strong>
                        <small>{chapter.advanced}/{chapter.arrived} đi tiếp</small>
                      </div>
                    ))}
                  </div>

                  <div className="dropoff-list" aria-label="Rời bỏ theo trạm ký ức">
                    {analytics.nodeDropOff.map((node) => (
                      <div key={node.nodeId}>
                        <span>Trạm {node.nodeOrder}</span>
                        <strong>{formatPercent(node.dropOffRate)}</strong>
                        <small>{node.completed}/{node.arrived} hoàn thành</small>
                      </div>
                    ))}
                  </div>

                  <p className={analytics.consistency.matchesSessionSource ? "api-message is-success" : "api-message is-warning"}>
                    {analytics.consistency.matchesSessionSource ? (
                      <Check size={18} aria-hidden="true" />
                    ) : (
                      <AlertCircle size={18} aria-hidden="true" />
                    )}
                    <span>
                      Event nguồn và session {analytics.consistency.matchesSessionSource ? "đang khớp" : "đang lệch"}.
                      Grain: {analytics.grain}.
                    </span>
                  </p>
                </>
              ) : analyticsStatus === "loading" ? (
                <p className="inline-loading" role="status">
                  <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                  <span>Đang tổng hợp trạng thái…</span>
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
