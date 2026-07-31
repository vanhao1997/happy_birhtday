"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import {
  AlertCircle,
  Check,
  Gift,
  Loader2,
  RefreshCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { initialsFromName } from "./content";
import { apiErrorMessage } from "@/lib/api-error";
import { publicPixelQuest } from "@/lib/birthday/dto";
import type {
  CompleteSessionResult,
  PublicCampaignDTO,
  PublicChapterDTO,
  PixelQuestEventName,
  RecordQuestProgressResult,
  StartSessionResult,
} from "@/lib/birthday/types";
import type { ApiStatus, BirthdaySession } from "./types";
import { ChildhoodMemoryMapGame as ChildhoodMemoryMap } from "./ChildhoodMemoryMapGame";

export { ChildhoodMemoryMapGame as PixelMemoryQuest } from "./ChildhoodMemoryMapGame";

type BirthdayExperienceProps = {
  slug: string;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const SESSION_VERSION = 2;
const MAP_STATION_LABELS = ["Nhà nhỏ", "Sân hè", "Lớp cũ", "Đường mơ", "Tuổi mới"] as const;

function recipientTone(index: number) {
  return (["pear", "cyan", "coral"] as const)[index % 3];
}

function createSession(slug: string, selectedName = ""): BirthdaySession {
  return {
    version: SESSION_VERSION,
    slug,
    selectedName,
    currentChapter: 0,
    completedChapterIds: [],
    answers: {},
    updatedAt: new Date().toISOString(),
  };
}

function isSession(value: unknown, slug: string): value is BirthdaySession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const session = value as Partial<BirthdaySession>;
  return session.version === SESSION_VERSION && session.slug === slug;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids));
}

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

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(apiErrorMessage(data, fallback));
  }

  return data as T;
}

function makeClientEventId(scope: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }

  return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getVoucherQrValue(voucher: CompleteSessionResult["voucher"]) {
  return voucher.code;
}

export function BirthdayExperience({ slug }: BirthdayExperienceProps) {
  const storageKey = `happybirthday.session.${slug}`;
  const [publicCampaign, setPublicCampaign] = useState<PublicCampaignDTO | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<ApiStatus>("loading");
  const [campaignMessage, setCampaignMessage] = useState("");
  const [session, setSession] = useState(() => createSession(slug));
  const [hydrated, setHydrated] = useState(false);
  const [restored, setRestored] = useState(false);
  const [audioOn, setAudioOn] = useState(false);
  const [startStatus, setStartStatus] = useState<ApiStatus>("idle");
  const [journeyStatus, setJourneyStatus] = useState<ApiStatus>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const remoteChapter = session.remoteChapter?.orderIndex === session.currentChapter + 1
    ? session.remoteChapter
    : null;
  const journeyChapter = session.journeyChapter
    ?? (session.remoteChapter?.orderIndex === 1 ? session.remoteChapter : null);
  const completedCount = session.completedChapterIds.length;
  const chapterCount = publicCampaign?.chapterCount ?? 4;
  const hasInterruptedChapter = completedCount < chapterCount && !remoteChapter;
  const activeMapStep = session.voucher ? 4 : Math.min(completedCount, 4);
  const selectedRecipient = publicCampaign?.recipients.find(
    (recipient) => recipient.id === session.recipientId,
  );

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      try {
        const raw = window.localStorage.getItem(storageKey);
        const stored = raw ? (JSON.parse(raw) as unknown) : null;

        if (!cancelled && isSession(stored, slug)) {
          setSession({
            ...createSession(slug),
            ...stored,
          });
          setRestored(true);
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slug, storageKey]);

  useEffect(() => {
    let ignore = false;

    async function loadCampaign() {
      setCampaignStatus("loading");
      setCampaignMessage("");

      try {
        const response = await fetch(`/api/campaigns/${encodeURIComponent(slug)}`);
        const data = await readApi<{ campaign: PublicCampaignDTO }>(
          response,
          "Không tải được chiến dịch.",
        );

        if (ignore) {
          return;
        }

        if (data.campaign.recipients.length < 2 || data.campaign.recipients.length > 5) {
          throw new Error("Chiến dịch cần từ 2 đến 5 người nhận đang hoạt động.");
        }

        setPublicCampaign(data.campaign);
        setCampaignStatus("success");
        setSession((current) => {
          if (
            current.recipientId &&
            data.campaign.recipients.some(
              (recipient) => recipient.id === current.recipientId,
            )
          ) {
            return current;
          }

          return createSession(slug);
        });
      } catch (error) {
        if (ignore) {
          return;
        }

        setCampaignStatus("error");
        setCampaignMessage(
          error instanceof Error
            ? error.message
            : "Không tải được chiến dịch.",
        );
      }
    }

    loadCampaign();

    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...session,
        voucher: undefined,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [hydrated, session, storageKey]);

  useEffect(() => {
    let ignore = false;

    async function buildQr() {
      if (!session.voucher) {
        setQrDataUrl("");
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(getVoucherQrValue(session.voucher), {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
        });

        if (!ignore) {
          setQrDataUrl(dataUrl);
        }
      } catch {
        if (!ignore) {
          setQrDataUrl("");
        }
      }
    }

    buildQr();

    return () => {
      ignore = true;
    };
  }, [session.voucher]);

  const playTone = useCallback(
    (frequency: number) => {
      if (!audioOn) {
        return;
      }

      const AudioContextConstructor =
        window.AudioContext ?? (window as AudioWindow).webkitAudioContext;

      if (!AudioContextConstructor) {
        return;
      }

      const context =
        audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = context;

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = "sine";
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
    },
    [audioOn],
  );

  async function ensureRemoteSession() {
    if (session.token) {
      return {
        token: session.token,
        chapter: remoteChapter,
      };
    }

    const recipientId = session.recipientId;

    if (!publicCampaign || !recipientId) {
      throw new Error("Chưa có campaign hoặc recipientId từ API.");
    }

    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignSlug: publicCampaign.slug,
        recipientId,
        clientEventId: makeClientEventId("start"),
      }),
    });
    const result = await readApi<StartSessionResult>(
      response,
      "Không thể bắt đầu session.",
    );

    setSession((current) => ({
      ...current,
      token: result.token,
      remoteSessionId: result.session.id,
      recipientId: result.recipient.id,
      selectedName: result.recipient.displayName,
      remoteChapter: result.chapter,
      nextChapter: undefined,
      journeyChapter: result.chapter,
    }));

    return {
      token: result.token,
      chapter: result.chapter,
    };
  }

  const trackJourneyEvent = useCallback(({
    token,
    chapterId,
    eventName,
    checkpointId,
    moveCount,
  }: {
    token: string;
    chapterId: string;
    eventName: PixelQuestEventName;
    checkpointId: string | null;
    moveCount: number;
  }) => {
    const stableLegacyEvent = eventName === "pixel_quest_started"
      || eventName === "pixel_quest_checkpoint"
      || eventName === "pixel_quest_completed";
    void fetch(`/api/sessions/${encodeURIComponent(token)}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventName,
        chapterId,
        checkpointId,
        clientEventId: stableLegacyEvent
          ? `memory-map:${eventName}:${chapterId}:${checkpointId ?? "complete"}`
          : makeClientEventId(`memory-map-${eventName}`),
        moveCount,
      }),
    });
  }, []);

  const reportGameEvent = useCallback((
    eventName: PixelQuestEventName,
    checkpointId: string | null,
    moveCount: number,
  ) => {
    const chapterId = remoteChapter?.id
      ?? session.completedChapterIds.at(-1)
      ?? journeyChapter?.id;
    if (!session.token || !chapterId) return;
    trackJourneyEvent({
      token: session.token,
      chapterId,
      eventName,
      checkpointId,
      moveCount,
    });
  }, [journeyChapter?.id, remoteChapter?.id, session.completedChapterIds, session.token, trackJourneyEvent]);

  async function openMapStation(
    stationIndex: number,
    zone: PublicChapterDTO["pixelQuest"]["zones"][number],
    moveCount: number,
  ) {
    if (journeyStatus === "loading") return false;

    setJourneyStatus("loading");
    setFeedbackMessage("");

    try {
      if (stationIndex < chapterCount) {
        if (stationIndex < completedCount) {
          setJourneyStatus("success");
          return true;
        }

        if (stationIndex !== completedCount) {
          throw new Error("Trạm này chưa được mở. Hãy đi theo đường chấm từ trạm gần nhất.");
        }

        const started = await ensureRemoteSession();
        const apiChapter = started.chapter;

        if (!apiChapter || apiChapter.orderIndex !== stationIndex + 1) {
          throw new Error("Tiến độ trên thiết bị chưa khớp với máy chủ. Hãy chọn lại tên để bắt đầu phiên mới.");
        }

        const apiChoice = apiChapter.options[0];
        if (!apiChoice) {
          throw new Error("Trạm ký ức chưa có mốc tiến trình nội bộ.");
        }
        const apiQuest = publicPixelQuest(apiChapter.pixelQuest).quests.find(
          (quest) => quest.nodeId === zone.id,
        );
        if (!apiQuest) {
          throw new Error("Trạm ký ức chưa có nhiệm vụ được cấu hình.");
        }

        if (stationIndex === 0) {
          trackJourneyEvent({
            token: started.token,
            chapterId: apiChapter.id,
            eventName: "pixel_quest_started",
            checkpointId: null,
            moveCount,
          });
        }
        trackJourneyEvent({
          token: started.token,
          chapterId: apiChapter.id,
          eventName: "pixel_quest_checkpoint",
          checkpointId: zone.id,
          moveCount,
        });

        const response = await fetch(
          `/api/sessions/${encodeURIComponent(started.token)}/progress`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chapterId: apiChapter.id,
              nodeId: zone.id,
              objectiveId: apiQuest.id,
              clientEventId: `memory-map-progress:${apiChapter.id}:${apiQuest.id}`,
              elapsedMs: null,
            }),
          },
        );
        const result = await readApi<RecordQuestProgressResult>(
          response,
          "Không thể lưu trạm ký ức.",
        );

        setSession((current) => ({
          ...current,
          answers: {
            ...current.answers,
            [apiChapter.id]: apiChoice.key,
          },
          completedChapterIds: uniqueIds([
            ...current.completedChapterIds,
            apiChapter.id,
          ]),
          currentChapter: result.nextChapter
            ? result.nextChapter.orderIndex - 1
            : chapterCount,
          remoteChapter: result.nextChapter,
          nextChapter: undefined,
          journeyChapter: current.journeyChapter ?? apiChapter,
        }));
        setJourneyStatus("success");
        setFeedbackMessage(result.response || apiQuest.completionLine);
        playTone(340 + stationIndex * 52);
        return true;
      }

      if (completedCount < chapterCount) {
        throw new Error("Cổng tuổi mới chỉ mở sau khi bốn mảnh ký ức đầu đã sáng.");
      }

      const started = await ensureRemoteSession();
      const eventChapterId = session.completedChapterIds.at(-1) ?? journeyChapter?.id;
      const finalQuest = publicPixelQuest(journeyChapter?.pixelQuest).quests.find(
        (quest) => quest.nodeId === zone.id,
      );
      if (!eventChapterId || !finalQuest) {
        throw new Error("Cổng tuổi mới chưa có nhiệm vụ hoặc chương xác nhận trên máy chủ.");
      }

      const progressResponse = await fetch(
        `/api/sessions/${encodeURIComponent(started.token)}/progress`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: eventChapterId,
            nodeId: zone.id,
            objectiveId: finalQuest.id,
            clientEventId: `memory-map-progress:${eventChapterId}:${finalQuest.id}`,
            elapsedMs: null,
          }),
        },
      );
      const finalProgress = await readApi<RecordQuestProgressResult>(
        progressResponse,
        "Không thể xác nhận cổng tuổi mới.",
      );

      if (eventChapterId) {
        trackJourneyEvent({
          token: started.token,
          chapterId: eventChapterId,
          eventName: "pixel_quest_completed",
          checkpointId: null,
          moveCount,
        });
      }

      const response = await fetch(
        `/api/sessions/${encodeURIComponent(started.token)}/complete`,
        { method: "POST" },
      );
      const result = await readApi<CompleteSessionResult>(
        response,
        "Không thể mở voucher.",
      );

      setSession((current) => ({
        ...current,
        voucher: result.voucher,
      }));
      setJourneyStatus("success");
      setFeedbackMessage(
        result.alreadyRevealed
          ? "Voucher đã được mở trước đó."
          : finalProgress.response || "Voucher đã mở.",
      );
      playTone(620);
      return true;
    } catch (error) {
      setJourneyStatus("error");
      setFeedbackMessage(
        error instanceof Error ? error.message : "Không thể lưu tiến độ bản đồ.",
      );
      return false;
    }
  }

  async function startStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStartStatus("loading");
    setFeedbackMessage("");

    try {
      await ensureRemoteSession();
      setStartStatus("success");
      setJourneyStatus("idle");
    } catch (error) {
      setStartStatus("error");
      setFeedbackMessage(
        error instanceof Error ? error.message : "Không thể bắt đầu session.",
      );
    }
  }

  function selectRecipient(recipientId: string) {
    const recipient = publicCampaign?.recipients.find((item) => item.id === recipientId);

    if (!recipient) {
      return;
    }

    setSession({
      ...createSession(slug, recipient.displayName),
      recipientId: recipient.id,
    });
    setFeedbackMessage("");
    setJourneyStatus("idle");
    setStartStatus("idle");
    setQrDataUrl("");
  }

  function resetSession() {
    setSession(createSession(slug));
    setRestored(false);
    setJourneyStatus("idle");
    setStartStatus("idle");
    setFeedbackMessage("");
    setQrDataUrl("");
    window.localStorage.removeItem(storageKey);
  }

  if (!hydrated) {
    return (
      <main className="birthday-page">
        <TopBar audioOn={audioOn} setAudioOn={setAudioOn} />
        <section className="birthday-shell is-loading" aria-live="polite">
          <div className="skeleton-block wide" />
          <div className="skeleton-block" />
          <div className="skeleton-row">
            <span />
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  }

  if (campaignStatus === "error" || (campaignStatus === "success" && !publicCampaign)) {
    return (
      <main className="birthday-page">
        <TopBar audioOn={audioOn} setAudioOn={setAudioOn} />
        <section className="route-state-box" role="alert">
          <p className="eyebrow">Link sinh nhật</p>
          <h1>Không mở được thư viện này</h1>
          <p>{campaignMessage || "Chiến dịch không tồn tại hoặc chưa được xuất bản."}</p>
          <Link className="primary-cta" href="/">
            Về trang đầu
          </Link>
        </section>
      </main>
    );
  }

  if (campaignStatus === "success" && publicCampaign && !session.token) {
    return (
      <main className="birthday-page">
        <TopBar audioOn={audioOn} setAudioOn={setAudioOn} />
        <section className="recipient-library" aria-labelledby="library-title">
          <div className="library-intro">
            <p className="eyebrow">Thư viện sinh nhật</p>
            <h1 id="library-title">{publicCampaign.title}</h1>
            <p>{publicCampaign.subtitle || "Chọn tên để mở bản đồ tuổi thơ riêng."}</p>
            <p className="library-meta">5 trạm ký ức · khoảng 5-7 phút · không có game over</p>
            <small>
              Link dùng theo mô hình tin cậy: người có link có thể chọn bất kỳ tên nào.
            </small>
          </div>

          <div className="recipient-library-list" role="group" aria-label="Chọn người nhận">
            {publicCampaign.recipients.map((recipient, index) => {
              const selected = recipient.id === session.recipientId;
              return (
                <button
                  type="button"
                  className={selected ? "recipient-card is-selected" : "recipient-card"}
                  key={recipient.id}
                  aria-pressed={selected}
                  onClick={() => selectRecipient(recipient.id)}
                >
                  <span className={`portrait-disc tone-${recipient.accent ?? recipientTone(index)}`}>
                    {recipient.avatarUrl ? (
                      <Image
                        src={recipient.avatarUrl}
                        alt=""
                        width={112}
                        height={112}
                        unoptimized
                      />
                    ) : (
                      initialsFromName(recipient.displayName)
                    )}
                  </span>
                  <span>
                    <strong>{recipient.displayName}</strong>
                    <small>{recipient.relationLabel || "Một câu chuyện riêng đang chờ"}</small>
                  </span>
                  {selected ? <Check size={20} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          <form className="library-start" onSubmit={startStory}>
            {feedbackMessage ? (
              <p className="api-message is-error" role="alert">
                <AlertCircle size={18} aria-hidden="true" />
                <span>{feedbackMessage}</span>
              </p>
            ) : null}
            <button
              type="submit"
              aria-busy={startStatus === "loading"}
              disabled={!session.recipientId || startStatus === "loading"}
            >
              {startStatus === "loading" ? (
                <Loader2 className="spin-icon" size={18} aria-hidden="true" />
              ) : (
                <Gift size={18} aria-hidden="true" />
              )}
              <span>Mở bản đồ của mình</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="birthday-page">
      <TopBar audioOn={audioOn} setAudioOn={setAudioOn} />

      <section className="birthday-shell" aria-labelledby="birthday-title">
        <aside className="story-rail" aria-label="Tiến độ bản đồ tuổi thơ">
          <div className={`portrait-disc tone-${selectedRecipient?.accent ?? "pear"}`}>
            <span>{initialsFromName(session.selectedName)}</span>
          </div>
          <div>
            <p className="eyebrow">Bản đồ tuổi thơ</p>
            <h1 id="birthday-title">{publicCampaign?.title}</h1>
            <p>{selectedRecipient?.character || selectedRecipient?.relationLabel || publicCampaign?.subtitle}</p>
          </div>
          <ol className="chapter-progress chapter-progress--map">
            {MAP_STATION_LABELS.map((label, index) => {
              const done = index < 4 ? index < completedCount : Boolean(session.voucher);
              const current = index === activeMapStep && !done;
              return (
                <li
                  key={label}
                  className={done ? "is-done" : current ? "is-current" : ""}
                >
                  <span>{index + 1}</span>
                  <small>{label}</small>
                </li>
              );
            })}
          </ol>
          {restored ? (
            <p className="resume-note" aria-live="polite">
              Đã mở lại bản đồ gần nhất trên thiết bị này.
            </p>
          ) : null}
        </aside>

        <section className="story-workspace story-workspace--map">
          {hasInterruptedChapter ? (
            <article className="chapter-panel" role="alert">
              <p className="eyebrow">Phiên đã gián đoạn</p>
              <h2>Không tìm thấy trạm đang khám phá</h2>
              <p>Tiến độ trên thiết bị không còn khớp với máy chủ. Chọn lại tên để bắt đầu phiên mới.</p>
              <div className="chapter-actions">
                <button type="button" onClick={resetSession}>
                  <RefreshCcw size={18} aria-hidden="true" />
                  <span>Chọn lại tên</span>
                </button>
              </div>
            </article>
          ) : (
            <>
              <ChildhoodMemoryMap
                images={journeyChapter?.memoryImages ?? []}
                pixelQuest={journeyChapter?.pixelQuest}
                recipientName={session.selectedName}
                childCharacter={selectedRecipient?.childCharacter ?? {
                  name: `Bé ${session.selectedName}`,
                  trait: "Tò mò, thích khám phá những điều thân quen",
                  archetype: "princess",
                }}
                accent={selectedRecipient?.accent ?? "pear"}
                sessionId={session.remoteSessionId ?? session.recipientId ?? ""}
                completedChapterCount={completedCount}
                voucherRevealed={Boolean(session.voucher)}
                status={journeyStatus}
                errorMessage={feedbackMessage}
                onOpenStation={openMapStation}
                onGameEvent={reportGameEvent}
              />

              {session.voucher ? (
                <article className="voucher-panel voucher-panel--map" aria-labelledby="voucher-title">
                  <p className="eyebrow">Cổng tuổi mới đã mở</p>
                  <h2 id="voucher-title">Voucher của {session.selectedName}</h2>
                  <p>
                    Máy chủ đã xác nhận đủ năm trạm ký ức. Mã quà chỉ xuất hiện trong khung này.
                  </p>
                  <div className="claim-success" role="status">
                    <div>
                      <p>{session.voucher.title}</p>
                      {session.voucher.description ? (
                        <small>{session.voucher.description}</small>
                      ) : null}
                    </div>
                    <strong>{session.voucher.code}</strong>
                    {session.voucher.terms ? (
                      <small>{session.voucher.terms}</small>
                    ) : null}
                    {session.voucher.expiresAt ? (
                      <small>
                        Hết hạn: {new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(
                          new Date(session.voucher.expiresAt),
                        )}
                      </small>
                    ) : null}
                    {qrDataUrl ? (
                      <Image
                        className="voucher-qr"
                        src={qrDataUrl}
                        alt="QR cho mã voucher"
                        width={220}
                        height={220}
                        unoptimized
                      />
                    ) : null}
                  </div>
                </article>
              ) : null}
            </>
          )}
        </section>
      </section>

      <footer className="birthday-footer">
        <button type="button" className="ghost-button" onClick={resetSession}>
          <RefreshCcw size={18} aria-hidden="true" />
          <span>Chọn tên khác</span>
        </button>
        <span>
          Tiến độ: {session.voucher ? 5 : Math.min(completedCount, 4)}/5 trạm
        </span>
      </footer>
    </main>
  );
}

function TopBar({
  audioOn,
  setAudioOn,
}: {
  audioOn: boolean;
  setAudioOn: (value: boolean) => void;
}) {
  return (
    <nav className="entry-nav birthday-topbar" aria-label="Điều hướng câu chuyện">
      <Link className="brand-mark" href="/">
        <span className="brand-symbol" aria-hidden="true">
          H
        </span>
        <span>Hum</span>
      </Link>
      <button
        className="icon-link"
        type="button"
        aria-pressed={audioOn}
        onClick={() => setAudioOn(!audioOn)}
      >
        {audioOn ? (
          <Volume2 size={18} aria-hidden="true" />
        ) : (
          <VolumeX size={18} aria-hidden="true" />
        )}
        <span>{audioOn ? "Âm thanh" : "Tắt tiếng"}</span>
      </button>
    </nav>
  );
}
