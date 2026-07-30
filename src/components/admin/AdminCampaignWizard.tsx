"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
  Lock,
  Mail,
  Save,
  Send,
} from "lucide-react";
import { initialsFromName, toBirthdaySlug } from "../birthday/content";
import { apiErrorMessage } from "@/lib/api-error";
import type {
  AdminCampaignPayload,
  AdminMagicLinkRequest,
  ApiStatus,
  BirthdayChapter,
} from "../birthday/types";

const ADMIN_STEPS = [
  "Chiến dịch",
  "Người nhận",
  "Chương truyện",
  "Voucher",
  "Xuất bản",
] as const;

const FIXED_CHAPTERS: BirthdayChapter[] = [
  {
    id: "door",
    title: "Mở cửa",
    scene: "Trang mở đầu giới thiệu tên người nhận và giọng chúc.",
    prompt: "Chọn lời mở đầu cho câu chuyện.",
    choices: [],
  },
  {
    id: "memory",
    title: "Ngăn ký ức",
    scene: "Người tạo chọn một khoảnh khắc để gắn vào truyện.",
    prompt: "Ký ức nào nên được giữ lại?",
    choices: [],
  },
  {
    id: "wish",
    title: "Lời ước",
    scene: "Trang lời chúc tạo nhịp chậm trước phần quà tặng.",
    prompt: "Điều gì nên gửi vào năm mới?",
    choices: [],
  },
  {
    id: "gift",
    title: "Hộp quà",
    scene: "Trang cuối nối câu chuyện với voucher thật.",
    prompt: "Voucher nào phù hợp nhất?",
    choices: [],
  },
];

const today = new Date().toISOString().slice(0, 10);

async function parseJson(response: Response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageFrom(data: Record<string, unknown>, fallback: string) {
  return apiErrorMessage(data, fallback);
}

export function AdminCampaignWizard() {
  const [email, setEmail] = useState("");
  const [authStatus, setAuthStatus] = useState<ApiStatus>("idle");
  const [authMessage, setAuthMessage] = useState("");
  const [meStatus, setMeStatus] = useState<ApiStatus>("idle");
  const [unlocked, setUnlocked] = useState(false);
  const [step, setStep] = useState(0);
  const [saveStatus, setSaveStatus] = useState<ApiStatus>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [campaign, setCampaign] = useState({
    workspaceId: "11111111-1111-4111-8111-111111111111",
    title: "Sinh nhật của Linh",
    recipientName: "Linh",
    startsAt: today,
    channel: "private_link" as "private_link" | "qr_card",
    voucherLabel: "Hẹn cafe riêng",
    voucherLimit: 1,
  });

  const payload = useMemo<AdminCampaignPayload>(() => {
    const slug = toBirthdaySlug(campaign.recipientName);

    return {
      title: campaign.title.trim() || `Sinh nhật của ${campaign.recipientName}`,
      slug,
      subtitle: "Bốn mảnh ghép nhỏ trước khi nhận quà",
      locale: "vi-VN",
      timezone: "Asia/Bangkok",
      status: "draft",
      workspaceId: campaign.workspaceId,
      theme: {
        tone: "hum",
        palette: "cream-pear-cyan-coral",
      },
      settings: {
        channel: campaign.channel,
        voucherLabel: campaign.voucherLabel,
        voucherLimit: campaign.voucherLimit,
        recipientName: campaign.recipientName,
        recipientInitials: initialsFromName(campaign.recipientName),
        chapters: FIXED_CHAPTERS,
      },
      startsAt: campaign.startsAt ? `${campaign.startsAt}T00:00:00.000Z` : null,
      endsAt: null,
    };
  }, [campaign]);

  const recipientMissing = campaign.recipientName.trim().length === 0;

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email.trim()) {
      setAuthStatus("error");
      setAuthMessage("Nhập email admin trước.");
      return;
    }

    const body: AdminMagicLinkRequest = {
      email: email.trim(),
      redirectTo: window.location.href,
    };

    setAuthStatus("loading");
    setAuthMessage("");

    try {
      const response = await fetch("/api/admin/auth/magic-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await parseJson(response);

      if (!response.ok) {
        throw new Error(messageFrom(data, `Magic-link API ${response.status}.`));
      }

      setAuthStatus("success");
      setAuthMessage(
        messageFrom(data, "Đã gửi magic link. Mở email để tạo Supabase session."),
      );
    } catch (error) {
      setAuthStatus("error");
      setAuthMessage(
        error instanceof Error ? error.message : "Không thể gửi magic link.",
      );
      setUnlocked(false);
    }
  }

  async function checkAdminSession() {
    setMeStatus("loading");
    setAuthMessage("");

    try {
      const response = await fetch(
        `/api/admin/me?workspaceId=${encodeURIComponent(campaign.workspaceId)}`,
        {
          credentials: "include",
        },
      );
      const data = await parseJson(response);

      if (!response.ok) {
        throw new Error(messageFrom(data, `Admin session API ${response.status}.`));
      }

      setMeStatus("success");
      setUnlocked(true);
      setAuthMessage("Đã xác thực admin session.");
    } catch (error) {
      setMeStatus("error");
      setUnlocked(false);
      setAuthMessage(
        error instanceof Error ? error.message : "Chưa có Supabase session.",
      );
    }
  }

  async function saveCampaign(status: "draft" | "published") {
    if (recipientMissing) {
      setSaveStatus("error");
      setSaveMessage("Tên người nhận đang trống.");
      return;
    }

    setSaveStatus("loading");
    setSaveMessage("");

    try {
      const response = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          status,
        }),
      });
      const data = await parseJson(response);

      if (!response.ok) {
        throw new Error(messageFrom(data, `Campaign API ${response.status}.`));
      }

      setSaveStatus("success");
      setSaveMessage(
        messageFrom(
          data,
          status === "published" ? "Đã gửi lên hàng xuất bản." : "Đã lưu bản nháp.",
        ),
      );
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Không thể lưu chiến dịch.",
      );
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-login-panel" aria-labelledby="admin-title">
        <div>
          <p className="eyebrow">Admin</p>
          <h1 id="admin-title">Magic link cho chiến dịch sinh nhật</h1>
          <p>
            Đăng nhập bằng email, sau đó tạo câu chuyện có slug, bốn chương cố
            định, và voucher ở trang cuối.
          </p>
        </div>

        <form className="admin-login-form" onSubmit={requestMagicLink}>
          <label htmlFor="workspace-id">Workspace ID</label>
          <input
            id="workspace-id"
            value={campaign.workspaceId}
            onChange={(event) =>
              setCampaign((current) => ({
                ...current,
                workspaceId: event.target.value,
              }))
            }
          />
          <label htmlFor="admin-email">Email admin</label>
          <div className="name-field-row">
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
            />
            <button type="submit" disabled={authStatus === "loading"}>
              {authStatus === "loading" ? (
                <Loader2 className="spin-icon" size={18} aria-hidden="true" />
              ) : (
                <Mail size={18} aria-hidden="true" />
              )}
              <span>Gửi link</span>
            </button>
          </div>
        </form>

        {authStatus === "error" ? (
          <p className="api-message is-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{authMessage}</span>
          </p>
        ) : null}
        {authStatus === "success" ? (
          <p className="api-message is-success" role="status">
            <Check size={18} aria-hidden="true" />
            <span>{authMessage}</span>
          </p>
        ) : null}
        {authStatus === "success" || meStatus === "error" ? (
          <button
            type="button"
            className="ghost-button"
            onClick={checkAdminSession}
            disabled={meStatus === "loading"}
          >
            {meStatus === "loading" ? (
              <Loader2 className="spin-icon" size={18} aria-hidden="true" />
            ) : (
              <Lock size={18} aria-hidden="true" />
            )}
            <span>Kiểm tra session</span>
          </button>
        ) : null}
      </section>

      {unlocked ? (
        <section className="wizard-shell" aria-labelledby="wizard-title">
          <aside className="wizard-steps">
            <p className="eyebrow">Wizard</p>
            <h2 id="wizard-title">Cấu hình chiến dịch</h2>
            <ol>
              {ADMIN_STEPS.map((label, index) => (
                <li key={label} className={index === step ? "is-current" : ""}>
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
                <legend>Thông tin chính</legend>
                <label htmlFor="campaign-title">Tên chiến dịch</label>
                <input
                  id="campaign-title"
                  value={campaign.title}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
                <label htmlFor="campaign-date">Ngày mở</label>
                <input
                  id="campaign-date"
                  type="date"
                  value={campaign.startsAt}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      startsAt: event.target.value,
                    }))
                  }
                />
                <label htmlFor="campaign-channel">Kênh chia sẻ</label>
                <select
                  id="campaign-channel"
                  value={campaign.channel}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      channel: event.target.value as "private_link" | "qr_card",
                    }))
                  }
                >
                  <option value="private_link">Private link</option>
                  <option value="qr_card">QR card</option>
                </select>
              </fieldset>
            ) : null}

            {step === 1 ? (
              <fieldset className="form-panel">
                <legend>Người nhận</legend>
                <label htmlFor="recipient">Tên người nhận</label>
                <input
                  id="recipient"
                  value={campaign.recipientName}
                  aria-invalid={recipientMissing}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      recipientName: event.target.value,
                      title: current.title || `Sinh nhật của ${event.target.value}`,
                    }))
                  }
                />
                {recipientMissing ? (
                  <p className="field-error" role="alert">
                    Tên người nhận bắt buộc.
                  </p>
                ) : null}
                <div className="admin-portrait-preview" aria-label="Anh dai dien tam">
                  <span>{payload.settings.recipientInitials}</span>
                  <small>Placeholder bằng initials cho đến khi admin thêm URL ảnh.</small>
                </div>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <div className="chapter-plan">
                <h3>Bốn chương cố định</h3>
                {FIXED_CHAPTERS.length === 0 ? (
                  <p className="empty-state">Chưa có chương nào trong cấu hình.</p>
                ) : (
                  <ol>
                    {FIXED_CHAPTERS.map((chapter, index) => (
                      <li key={chapter.id}>
                        <span>{index + 1}</span>
                        <div>
                          <strong>{chapter.title}</strong>
                          <small>{chapter.scene}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            {step === 3 ? (
              <fieldset className="form-panel">
                <legend>Voucher</legend>
                <label htmlFor="voucher-label">Tên voucher</label>
                <input
                  id="voucher-label"
                  value={campaign.voucherLabel}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      voucherLabel: event.target.value,
                    }))
                  }
                />
                <label htmlFor="voucher-limit">Số lượng cho mỗi người nhận</label>
                <input
                  id="voucher-limit"
                  type="number"
                  min={1}
                  max={10}
                  value={campaign.voucherLimit}
                  onChange={(event) =>
                    setCampaign((current) => ({
                      ...current,
                      voucherLimit: Number(event.target.value),
                    }))
                  }
                />
              </fieldset>
            ) : null}

            {step === 4 ? (
              <div className="publish-panel">
                <h3>Kiểm tra trước khi xuất bản</h3>
                <dl>
                  <div>
                    <dt>Slug</dt>
                    <dd>/birthday/{payload.slug}</dd>
                  </div>
                  <div>
                    <dt>Người nhận</dt>
                    <dd>{payload.settings.recipientName || "Chưa có tên"}</dd>
                  </div>
                  <div>
                    <dt>Voucher</dt>
                    <dd>{payload.settings.voucherLabel}</dd>
                  </div>
                </dl>
                {saveStatus === "error" ? (
                  <p className="api-message is-error" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>{saveMessage}</span>
                  </p>
                ) : null}
                {saveStatus === "success" ? (
                  <p className="api-message is-success" role="status">
                    <Check size={18} aria-hidden="true" />
                    <span>{saveMessage}</span>
                  </p>
                ) : null}
                <div className="chapter-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => saveCampaign("draft")}
                    disabled={saveStatus === "loading"}
                  >
                    <Save size={18} aria-hidden="true" />
                    <span>Lưu nháp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => saveCampaign("published")}
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
              <button
                type="button"
                onClick={() => setStep((current) => Math.min(current + 1, 4))}
                disabled={step === 4}
              >
                <span>Tiếp</span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          </section>

          <aside className="campaign-preview" aria-label="Bản xem trước">
            <span className="initial-badge tone-pear">
              {payload.settings.recipientInitials}
            </span>
            <p className="eyebrow">Preview</p>
            <h2>{payload.title}</h2>
            <p>
              /birthday/{payload.slug} sẽ mở một câu chuyện bốn chương và kết
              thúc bằng voucher <strong>{payload.settings.voucherLabel}</strong>.
            </p>
          </aside>
        </section>
      ) : (
        <section className="wizard-empty" aria-live="polite">
          <Lock size={22} aria-hidden="true" />
          <p>Nhập email admin để mở wizard cấu hình chiến dịch.</p>
        </section>
      )}
    </main>
  );
}
