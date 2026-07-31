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
import type {
  AdminCampaignAnalyticsResult,
  ChapterGameType,
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
  if (value === null) return "—";
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
  "Người nhận",
  "Bốn chương",
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
      prompt: "Bạn muốn mang năng lượng nào vào tuổi mới?",
      options: [
        { key: "focus", label: "Tập trung sâu", response: "Một khoảng tập trung sâu đã được giữ lại." },
        { key: "steady", label: "Vững nhịp", response: "Nhịp vững đã mở đường sang chương tiếp theo." },
      ],
    },
    {
      orderIndex: 2,
      gameType: "detail_hunt",
      title: "Khoảnh khắc chỉ bạn mới có",
      body: "Nhắc lại một tình huống thật ở công ty: một lần hỗ trợ, một câu nói quen, hoặc một chi tiết nhỏ khiến mọi người nhớ tới bạn.",
      prompt: "Chi tiết nào nên nằm lại trong cuốn truyện?",
      options: [
        { key: "memory-a", label: "Khoảnh khắc thứ nhất", response: "Ký ức thứ nhất đã được ghim vào trang." },
        { key: "memory-b", label: "Khoảnh khắc thứ hai", response: "Ký ức thứ hai đã trở thành dấu mốc." },
      ],
    },
    {
      orderIndex: 3,
      gameType: "message_unlock",
      title: "Lời kể từ đồng đội",
      body: "Một lời nhắn đã được đồng đội đồng ý sử dụng sẽ xuất hiện tại đây.",
      prompt: "Bạn đoán lời nhắn này muốn cảm ơn điều gì?",
      options: [
        { key: "thanks-a", label: "Một lần giúp đúng lúc", response: "Lời cảm ơn đã được mở." },
        { key: "thanks-b", label: "Cách bạn làm việc mỗi ngày", response: "Điều quen thuộc nhất cũng là điều đáng quý." },
      ],
    },
    {
      orderIndex: 4,
      gameType: "story_branch",
      title: "Ngã rẽ tuổi mới",
      body: "Không có lựa chọn sai. Mỗi hướng chỉ thay đổi cách câu chuyện khép lại.",
      prompt: "Chọn một hướng cho chương mới.",
      options: [
        { key: "adventure", label: "Thử điều mới", response: "Đoạn kết mở ra một chuyến đi mới." },
        { key: "slow", label: "Chậm mà chắc", response: "Đoạn kết giữ một khoảng thở rộng hơn." },
      ],
    },
  ];
}

function recipientSeed(index: number, name: string, role: string): EditableRecipient {
  const tones = ["pear", "cyan", "coral"] as const;
  return {
    clientId: `recipient-${index}`,
    displayName: name,
    relationLabel: role,
    birthdayDate: `199${index + 3}-08-${String(index * 8 + 5).padStart(2, "0")}`,
    avatarUrl: "",
    childhoodPhotos: Array.from({ length: 3 }, () => ({ url: "", caption: "" })),
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
    voucherHint: "Mã dùng một lần sau khi hoàn tất bốn chương",
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
    subtitle: "Bốn mảnh ghép nhỏ dành cho đồng đội tháng 8",
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

  function updateOption(
    chapterIndex: number,
    optionIndex: number,
    patch: Partial<EditableOption>,
  ) {
    const chapter = currentRecipient.chapters[chapterIndex];
    updateChapter(chapterIndex, {
      options: chapter.options.map((option, index) =>
        index === optionIndex ? { ...option, ...patch } : option,
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
      if (recipient.chapters.length !== 4 || recipient.chapters.some((chapter) => chapter.options.length < 1)) {
        return `${recipient.displayName} cần đủ bốn chương và lựa chọn.`;
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
            settings: { audioDefault: false, trustModel: "recipient_picker" },
          }),
        });
        campaignId = (data.campaign as { id: string }).id;
        setSavedCampaignId(campaignId);

        for (const recipient of recipients) {
          const memoryImages = recipient.childhoodPhotos
            .filter((photo) => photo.url.trim())
            .slice(0, 3)
            .map((photo, index) => ({
              url: photo.url.trim(),
              alt: `Ảnh tuổi thơ ${index + 1} của ${recipient.displayName.trim() || "người nhận"}`,
              caption: photo.caption.trim(),
            }));
          const visibleMessage =
            recipient.consentStatus === "approved"
              ? `“${recipient.messageBody}” — ${recipient.messageSender}`
              : "Lời nhắn đang chờ đồng ý sử dụng.";
          const chapters = recipient.chapters.map((chapter) => ({
            ...chapter,
            body: chapter.orderIndex === 3 ? `${chapter.body}\n\n${visibleMessage}` : chapter.body,
            isPublished: true,
            metadata: {
              gameType: chapter.gameType,
              estimatedSeconds: 75,
              noFailPath: true,
              memoryImages: chapter.orderIndex <= 2 ? memoryImages : [],
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
          <p className="eyebrow">Admin riêng</p>
          <h1 id="admin-title">Tạo một link chung, giữ từng câu chuyện riêng</h1>
          <p>Magic link xác thực qua Supabase. Wizard chỉ mở sau khi server kiểm tra quyền workspace.</p>
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
            <p className="eyebrow">Wizard tháng 8</p>
            <h2 id="wizard-title">Cấu hình chiến dịch</h2>
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
                        <p>Ba ảnh sẽ thành ba ải trong mini game pixel ký ức ở hai chương đầu tiên.</p>
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
                <h3>Bốn chương của {currentRecipient.displayName}</h3>
                {currentRecipient.chapters.map((chapter, chapterIndex) => (
                  <fieldset className="form-panel" key={chapter.orderIndex}>
                    <legend>Chương {chapter.orderIndex}</legend>
                    <small className="chapter-kind">
                      {CHAPTER_GAME_LABELS[chapter.gameType]} · khoảng 1 phút
                    </small>
                    <label htmlFor={`chapter-title-${chapter.orderIndex}`}>Tiêu đề</label>
                    <input id={`chapter-title-${chapter.orderIndex}`} value={chapter.title} onChange={(event) => updateChapter(chapterIndex, { title: event.target.value })} />
                    <label htmlFor={`chapter-body-${chapter.orderIndex}`}>Nội dung cá nhân</label>
                    <textarea id={`chapter-body-${chapter.orderIndex}`} value={chapter.body} onChange={(event) => updateChapter(chapterIndex, { body: event.target.value })} />
                    <label htmlFor={`chapter-prompt-${chapter.orderIndex}`}>Câu hỏi</label>
                    <input id={`chapter-prompt-${chapter.orderIndex}`} value={chapter.prompt} onChange={(event) => updateChapter(chapterIndex, { prompt: event.target.value })} />
                    {chapter.options.map((option, optionIndex) => (
                      <div className="option-editor" key={option.key}>
                        <label htmlFor={`option-${chapter.orderIndex}-${optionIndex}`}>Lựa chọn {optionIndex + 1}</label>
                        <input id={`option-${chapter.orderIndex}-${optionIndex}`} value={option.label} onChange={(event) => updateOption(chapterIndex, optionIndex, { label: event.target.value })} />
                        <input aria-label={`Phản hồi lựa chọn ${optionIndex + 1}`} value={option.response} onChange={(event) => updateOption(chapterIndex, optionIndex, { response: event.target.value })} />
                      </div>
                    ))}
                  </fieldset>
                ))}
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
                  <div><dt>Mỗi hành trình</dt><dd>4 chương, không có nhánh thất bại</dd></div>
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
