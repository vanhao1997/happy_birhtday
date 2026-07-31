"use client";

import { CSSProperties, FormEvent, KeyboardEvent, useCallback, useEffect, useReducer, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Gift,
  Loader2,
  RefreshCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { initialsFromName } from "./content";
import { apiErrorMessage } from "@/lib/api-error";
import { CHAPTER_GAME_TYPES } from "@/lib/birthday/types";
import type {
  CompleteSessionResult,
  PublicCampaignDTO,
  PublicChapterDTO,
  PublicChildCharacterDTO,
  PublicMemoryImageDTO,
  PublicPixelQuestConfigDTO,
  RecordChoiceResult,
  StartSessionResult,
  ChapterGameType,
  PixelCharacterArchetype,
} from "@/lib/birthday/types";
import type { ApiStatus, BirthdayChoice, BirthdaySession } from "./types";
import {
  createPixelQuestState,
  pixelQuestProgress,
  pixelQuestReducer,
} from "./pixel-quest";

type BirthdayExperienceProps = {
  slug: string;
};

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

const SESSION_VERSION = 1;
const CHAPTER_LABELS = ["Mảnh ghép", "Ký ức", "Lời kể", "Ngã rẽ"] as const;
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

function remoteToLocalChapter(remote: PublicChapterDTO) {
  const gameType = CHAPTER_GAME_TYPES.includes(remote.gameType)
    ? remote.gameType
    : CHAPTER_GAME_TYPES[remote.orderIndex - 1] ?? "story_branch";

  return {
    id: remote.id,
    gameType,
    title: remote.title,
    scene: remote.body,
    prompt: remote.prompt,
    memoryImages: remote.memoryImages ?? [],
    pixelQuest: remote.pixelQuest,
    remote,
    choices: remote.options.map((option) => ({
      id: option.key,
      label: option.label,
      reply: "Lựa chọn đã được giữ lại cho đoạn kết.",
    })),
  };
}

function pickRemoteChoice(remote: PublicChapterDTO, choice: BirthdayChoice) {
  return (
    remote.options.find((option) => option.key === choice.id) ?? remote.options[0]
  );
}

function getVoucherQrValue(voucher: CompleteSessionResult["voucher"]) {
  return voucher.code;
}

export function PixelMemoryQuest({
  images,
  pixelQuest = DEFAULT_PIXEL_QUEST,
  recipientName,
  childCharacter,
  accent,
  sessionToken,
  sessionId,
  chapterId,
}: {
  images: PublicMemoryImageDTO[];
  pixelQuest?: PublicPixelQuestConfigDTO;
  recipientName: string;
  childCharacter: PublicChildCharacterDTO;
  accent: "pear" | "cyan" | "coral";
  sessionToken?: string;
  sessionId: string;
  chapterId: string;
}) {
  const safeImages = Array.isArray(images) ? images : [];
  const frames = Array.from({ length: 3 }, (_, index) => safeImages[index] ?? null);
  const [questState, dispatchQuest] = useReducer(
    pixelQuestReducer,
    undefined,
    () => createPixelQuestState(chapterId, pixelQuest),
  );
  const [isJumping, setIsJumping] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const jumpTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentEventIdsRef = useRef(new Set<string>());
  const progressStorageKey = `happybirthday.pixelQuest.${sessionId || "local"}.${chapterId}`;
  const unlockedCount = questState.visitedCheckpointIds.length;
  const activeZoneIndex = Math.max(
    0,
    pixelQuest.zones.findIndex((zone) => zone.id === questState.activeCheckpointId),
  );
  const activeZone = pixelQuest.zones[activeZoneIndex];
  const activeUnlocked = questState.activeCheckpointId !== null;
  const activeImage = activeUnlocked ? frames[activeZoneIndex] : null;

  useEffect(() => () => {
    if (jumpTimeoutRef.current) clearTimeout(jumpTimeoutRef.current);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(progressStorageKey);
      dispatchQuest({
        type: "restore",
        progress: raw ? JSON.parse(raw) as unknown : null,
        config: pixelQuest,
      });
    } catch {
      window.localStorage.removeItem(progressStorageKey);
      dispatchQuest({ type: "hydrate", config: pixelQuest });
    }
  }, [pixelQuest, progressStorageKey]);

  useEffect(() => {
    if (!questState.hydrated) return;
    window.localStorage.setItem(
      progressStorageKey,
      JSON.stringify(pixelQuestProgress(questState)),
    );
  }, [progressStorageKey, questState]);

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) return;

    const updateViewport = () => {
      const width = screen.getBoundingClientRect().width || screen.clientWidth || 320;
      dispatchQuest({ type: "resize", viewportWidth: width, config: pixelQuest });
    };

    updateViewport();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateViewport);
    observer.observe(screen);
    return () => observer.disconnect();
  }, [pixelQuest]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReducedMotion(media.matches);
    updatePreference();
    media.addEventListener?.("change", updatePreference);
    return () => media.removeEventListener?.("change", updatePreference);
  }, []);

  useEffect(() => {
    if (!sessionToken || !questState.hydrated) return;

    const events = [
      {
        eventName: "pixel_quest_started",
        checkpointId: null,
        clientEventId: `pixel:start:${chapterId}`,
      },
      ...questState.visitedCheckpointIds.map((checkpointId) => ({
        eventName: "pixel_quest_checkpoint",
        checkpointId,
        clientEventId: `pixel:checkpoint:${chapterId}:${checkpointId}`,
      })),
      ...(questState.questCompleted
        ? [{
            eventName: "pixel_quest_completed",
            checkpointId: null,
            clientEventId: `pixel:complete:${chapterId}`,
          }]
        : []),
    ] as const;

    for (const event of events) {
      if (sentEventIdsRef.current.has(event.clientEventId)) continue;
      sentEventIdsRef.current.add(event.clientEventId);

      void fetch(`/api/sessions/${encodeURIComponent(sessionToken)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...event,
          chapterId,
          moveCount: questState.moveCount,
        }),
      }).then((response) => {
        if (!response.ok) sentEventIdsRef.current.delete(event.clientEventId);
      }).catch(() => {
        sentEventIdsRef.current.delete(event.clientEventId);
      });
    }
  }, [chapterId, questState, sessionToken]);

  function movePlayer(delta: -1 | 1) {
    dispatchQuest({ type: "move", direction: delta, config: pixelQuest });
  }

  function enterGate(index: number) {
    const zone = pixelQuest.zones[index];
    if (!zone) return;
    dispatchQuest({ type: "visit", checkpointId: zone.id, config: pixelQuest });
  }

  function jump() {
    if (reducedMotion) return;
    setIsJumping(false);
    if (jumpTimeoutRef.current) clearTimeout(jumpTimeoutRef.current);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => setIsJumping(true));
    } else {
      setIsJumping(true);
    }
    jumpTimeoutRef.current = setTimeout(() => setIsJumping(false), 360);
  }

  function handleGameKeyDown(event: KeyboardEvent<HTMLElement>) {
    const key = event.key.toLowerCase();

    if ((key === " " || key === "enter") && (event.target as HTMLElement).tagName === "BUTTON") {
      return;
    }

    if (key === "arrowleft" || key === "a") {
      event.preventDefault();
      movePlayer(-1);
    } else if (key === "arrowright" || key === "d") {
      event.preventDefault();
      movePlayer(1);
    } else if (key === "arrowup" || key === "w" || key === " ") {
      event.preventDefault();
      jump();
    }
  }

  return (
    <section
      className="memory-trail pixel-quest"
      aria-labelledby="pixel-quest-title"
      data-reduced-motion={reducedMotion}
      data-quest-completed={questState.questCompleted}
    >
      <div className="memory-trail__intro pixel-quest__intro">
        <div>
          <p className="memory-trail__kicker">Memory Quest 2000 · 3 vùng đất</p>
          <h3 id="pixel-quest-title">Đưa {childCharacter.name} băng qua vương quốc ký ức</h3>
        </div>
        <p>Đi qua từng vùng, nhặt đủ ba mảnh. Không game over, không mất quà.</p>
      </div>
      <div
        ref={screenRef}
        className="pixel-quest__screen"
        data-unlocked={unlockedCount}
        role="group"
        aria-label={`Mini game ký ức của ${recipientName}. Dùng phím trái phải hoặc A D để di chuyển, phím lên hoặc W để nhảy.`}
        tabIndex={0}
        onKeyDown={handleGameKeyDown}
      >
        <div className="pixel-quest__hud" aria-hidden="true">
          <span>LV 01</span>
          <span>MEM {unlockedCount}/3</span>
          <span>NO FAIL</span>
        </div>
        <div
          className="pixel-quest__camera"
          style={{
            "--camera-x": `${questState.cameraPosition}px`,
            "--pixel-world-width": `${pixelQuest.worldWidthPx}px`,
          } as CSSProperties}
        >
          <div className="pixel-quest__world" aria-hidden="true">
            {pixelQuest.zones.map((zone, index) => (
              <span
                className={`pixel-quest__zone pixel-quest__zone--${index + 1}`}
                key={zone.id}
              >
                <b>{zone.title}</b>
              </span>
            ))}
            <span className="pixel-scenery pixel-scenery--cloud-one" />
            <span className="pixel-scenery pixel-scenery--cloud-two" />
            <span className="pixel-scenery pixel-scenery--city" />
            <span className="pixel-scenery pixel-scenery--castle" />
            <span className="pixel-scenery pixel-scenery--tree-one" />
            <span className="pixel-scenery pixel-scenery--tree-two" />
            <span className="pixel-scenery pixel-scenery--portal" />
            <span className="pixel-quest__ground" />
          </div>
          <div className="pixel-quest__gates">
            {pixelQuest.zones.map((zone, index) => {
              const unlocked = questState.visitedCheckpointIds.includes(zone.id);
              return (
                <div
                  className={unlocked ? "pixel-gate is-unlocked" : "pixel-gate"}
                  data-gate={index + 1}
                  key={zone.id}
                  style={{ "--checkpoint-x": `${zone.checkpointPosition}px` } as CSSProperties}
                  aria-hidden="true"
                >
                  <span className="pixel-gate__number">0{index + 1}</span>
                  <span className="pixel-gate__portal" aria-hidden="true"><i /></span>
                  <small>{unlocked ? "OPEN" : "MEMORY"}</small>
                  <span className={`pixel-npc pixel-npc--${index + 1}`}><i /></span>
                </div>
              );
            })}
          </div>
          <div
            className="pixel-player-track"
            style={{ "--player-x": `${questState.playerPosition}px` } as CSSProperties}
            aria-hidden="true"
          >
            <div className={isJumping ? `pixel-player tone-${accent} archetype-${childCharacter.archetype} is-jumping` : `pixel-player tone-${accent} archetype-${childCharacter.archetype}`}>
              <span className="pixel-player__crown" />
              <span className="pixel-player__cape" />
              <span className="pixel-player__hair" />
              <span className="pixel-player__face">{initialsFromName(recipientName).slice(0, 1)}</span>
              <span className="pixel-player__shirt" />
              <span className="pixel-player__legs"><i /><i /></span>
            </div>
          </div>
        </div>
      </div>
      <div className="pixel-quest__deck">
        <div className="pixel-controller" aria-label="Điều khiển nhân vật">
          <button type="button" className="pixel-controller__jump" aria-label="Nhảy" onClick={jump}>↑</button>
          <button type="button" className="pixel-controller__left" aria-label="Đi sang trái" onClick={() => movePlayer(-1)} disabled={questState.playerPosition === pixelQuest.startPosition}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <button type="button" className="pixel-controller__right" aria-label="Đi sang phải" onClick={() => movePlayer(1)} disabled={questState.playerPosition >= pixelQuest.worldWidthPx - 80}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </div>
        <div className={`pixel-quest__identity tone-${accent}`}>
          <span aria-hidden="true">P1</span>
          <div>
            <strong>{childCharacter.name}</strong>
            <small>{PIXEL_CHARACTER_LABELS[childCharacter.archetype]}</small>
            <small>{childCharacter.trait}</small>
            <em>← → / A D để đi · ↑ / W để nhảy</em>
          </div>
        </div>
      </div>
      <ol className="pixel-quest__checkpoint-list" aria-label="Danh sách checkpoint ký ức">
        {pixelQuest.zones.map((zone, index) => {
          const unlocked = questState.visitedCheckpointIds.includes(zone.id);
          const enabled = index === 0
            || questState.visitedCheckpointIds.includes(pixelQuest.zones[index - 1].id);
          return (
            <li
              key={zone.id}
              data-active={questState.activeCheckpointId === zone.id}
              data-enabled={enabled}
              data-unlocked={unlocked}
            >
              <div className="pixel-quest__checkpoint-copy">
                <span>0{index + 1}</span>
                <div>
                  <strong>{zone.title}</strong>
                  <small>{zone.npcLine}</small>
                </div>
              </div>
              <button
                type="button"
                aria-label={`${unlocked ? "Xem ký ức" : enabled ? "Khám phá" : "Chưa mở"}: ${zone.title}`}
                aria-pressed={questState.activeCheckpointId === zone.id}
                disabled={!enabled}
                onClick={() => enterGate(index)}
              >
                {unlocked ? "Xem ký ức" : enabled ? "Khám phá" : "Chưa mở"}
              </button>
              <em>{unlocked ? "Đã tìm thấy" : enabled ? "Có thể khám phá" : "Mở sau vùng trước"}</em>
            </li>
          );
        })}
      </ol>
      <p className="pixel-quest__log" role="status" aria-live="polite">
        {questState.questCompleted
          ? "Đã gom đủ 3 mảnh ký ức. Cổng tuổi mới sáng rồi!"
          : activeUnlocked
            ? `Đã mở ${activeZone.title}. ${activeZone.npcLine}`
            : "Hành trình bắt đầu. Di chuyển sang phải hoặc chọn Làng tuổi thơ."}
      </p>
      <div className={activeUnlocked ? "pixel-memory-reveal is-unlocked" : "pixel-memory-reveal"}>
        <div className="pixel-memory-reveal__frame">
          {activeImage ? (
            <Image src={activeImage.url} alt={activeImage.alt} width={640} height={480} sizes="(max-width: 640px) 88vw, 520px" unoptimized />
          ) : activeUnlocked ? (
            <span><strong>MEMORY FOUND</strong><small>Ải đã mở · chờ ảnh thật</small></span>
          ) : (
            <span><strong>MEMORY LOCKED</strong><small>Đi tới cổng ký ức đầu tiên</small></span>
          )}
        </div>
        <div>
          <span>Vùng {String(activeZoneIndex + 1).padStart(2, "0")} · {unlockedCount}/3 mảnh</span>
          <p>{activeImage ? activeImage.caption || activeImage.alt : activeUnlocked ? "Bạn đã nhặt được mảnh ký ức này. Admin có thể thêm ảnh thật vào đúng ải." : "Di chuyển nhân vật sang phải. Khi chạm cổng, ký ức sẽ tự mở."}</p>
        </div>
      </div>
    </section>
  );
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
  const [choiceStatus, setChoiceStatus] = useState<ApiStatus>("idle");
  const [completeStatus, setCompleteStatus] = useState<ApiStatus>("idle");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [pendingChoiceId, setPendingChoiceId] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const audioContextRef = useRef<AudioContext | null>(null);

  const remoteChapter = session.remoteChapter?.orderIndex === session.currentChapter + 1
    ? session.remoteChapter
    : null;
  const currentChapter = remoteChapter ? remoteToLocalChapter(remoteChapter) : undefined;
  const currentChapterKey = currentChapter?.id ?? "";
  const completedCount = session.completedChapterIds.length;
  const chapterCount = publicCampaign?.chapterCount ?? 4;
  const isFinished = session.currentChapter >= chapterCount;
  const answeredCurrent = currentChapterKey
    ? session.answers[currentChapterKey]
    : undefined;
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
    }));

    return {
      token: result.token,
      chapter: result.chapter,
    };
  }

  async function selectChoice(
    chapter: ReturnType<typeof remoteToLocalChapter>,
    choice: BirthdayChoice,
  ) {
    if (choiceStatus === "loading") {
      return;
    }

    setPendingChoiceId(choice.id);
    setFeedbackMessage("");
    setChoiceStatus("loading");

    try {
      const started = await ensureRemoteSession();
      const apiChapter = chapter.remote ?? started.chapter;

      if (!apiChapter) {
        throw new Error("Session chưa trả về chương hiện tại.");
      }

      const apiChoice = pickRemoteChoice(apiChapter, choice);

      if (!apiChoice) {
        throw new Error("Chương hiện tại chưa có lựa chọn từ API.");
      }

      const response = await fetch(
        `/api/sessions/${encodeURIComponent(started.token)}/choices`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chapterId: apiChapter.id,
            choiceKey: apiChoice.key,
            answerText: choice.label,
            clientEventId: makeClientEventId("choice"),
            elapsedMs: null,
          }),
        },
      );
      const result = await readApi<RecordChoiceResult>(
        response,
        "Không thể ghi lựa chọn.",
      );

      setSession((current) => ({
        ...current,
        answers: {
          ...current.answers,
          [currentChapterKey]: choice.id,
        },
        completedChapterIds: uniqueIds([
          ...current.completedChapterIds,
          currentChapterKey,
        ]),
        nextChapter: result.nextChapter,
      }));
      setFeedbackMessage(
        result.acceptedChoice.response || choice.reply,
      );
      setChoiceStatus("success");
      setPendingChoiceId("");
      playTone(320 + completedCount * 40);
    } catch (error) {
      setChoiceStatus("error");
      setPendingChoiceId("");
      setFeedbackMessage(
        error instanceof Error
          ? `API chưa ghi lựa chọn: ${error.message}`
          : "API chưa ghi được lựa chọn.",
      );
    }
  }

  async function startStory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStartStatus("loading");
    setFeedbackMessage("");

    try {
      await ensureRemoteSession();
      setStartStatus("success");
      setChoiceStatus("idle");
    } catch (error) {
      setStartStatus("error");
      setFeedbackMessage(
        error instanceof Error ? error.message : "Không thể bắt đầu session.",
      );
    }
  }

  function goToNextChapter() {
    setSession((current) => ({
      ...current,
      currentChapter: Math.min(current.currentChapter + 1, chapterCount),
      remoteChapter: current.nextChapter ?? null,
      nextChapter: undefined,
    }));
    setFeedbackMessage("");
    setChoiceStatus("idle");
    setPendingChoiceId("");
    playTone(440);
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
    setCompleteStatus("idle");
    setStartStatus("idle");
    setQrDataUrl("");
  }

  function resetSession() {
    setSession(createSession(slug));
    setRestored(false);
    setChoiceStatus("idle");
    setCompleteStatus("idle");
    setStartStatus("idle");
    setFeedbackMessage("");
    setPendingChoiceId("");
    setQrDataUrl("");
    window.localStorage.removeItem(storageKey);
  }

  async function completeSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCompleteStatus("loading");
    setFeedbackMessage("");

    try {
      const started = await ensureRemoteSession();
      const response = await fetch(
        `/api/sessions/${encodeURIComponent(started.token)}/complete`,
        {
          method: "POST",
        },
      );
      const result = await readApi<CompleteSessionResult>(
        response,
        "Không thể mở voucher.",
      );

      setSession((current) => ({
        ...current,
        voucher: result.voucher,
      }));
      setCompleteStatus("success");
      setFeedbackMessage(
        result.alreadyRevealed ? "Voucher đã được mở trước đó." : "Voucher đã mở.",
      );
      playTone(620);
    } catch (error) {
      setCompleteStatus("error");
      setFeedbackMessage(
        error instanceof Error ? error.message : "Không thể mở voucher.",
      );
    }
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
            <p>{publicCampaign.subtitle || "Chọn đúng tên để mở hành trình riêng."}</p>
            <p className="library-meta">4 chương · khoảng 5–7 phút · không có đáp án thất bại</p>
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
              <span>Mở câu chuyện của mình</span>
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
        <aside className="story-rail" aria-label="Tiến độ câu chuyện">
          <div className={`portrait-disc tone-${selectedRecipient?.accent ?? "pear"}`}>
            <span>{initialsFromName(session.selectedName)}</span>
          </div>
          <div>
            <p className="eyebrow">Storybook</p>
            <h1 id="birthday-title">{publicCampaign?.title}</h1>
            <p>{selectedRecipient?.character || selectedRecipient?.relationLabel || publicCampaign?.subtitle}</p>
          </div>
          <ol className="chapter-progress">
            {CHAPTER_LABELS.map((label, index) => (
              <li
                key={label}
                className={
                  index === session.currentChapter
                    ? "is-current"
                    : index < completedCount
                      ? "is-done"
                      : ""
                }
              >
                <span>{index + 1}</span>
                <small>{label}</small>
              </li>
            ))}
          </ol>
          {restored ? (
            <p className="resume-note" aria-live="polite">
              Đã mở lại tiến độ gần nhất từ thiết bị này.
            </p>
          ) : null}
        </aside>

        <section className="story-workspace">
          {!isFinished && !currentChapter ? (
            <article className="chapter-panel" role="alert">
              <p className="eyebrow">Phiên đã gián đoạn</p>
              <h2>Không tìm thấy chương đang chơi</h2>
              <p>Phiên trên thiết bị không còn khớp với máy chủ. Chọn lại tên để bắt đầu phiên mới.</p>
              <div className="chapter-actions">
                <button type="button" onClick={resetSession}>
                  <RefreshCcw size={18} aria-hidden="true" />
                  <span>Chọn lại tên</span>
                </button>
              </div>
            </article>
          ) : !isFinished && currentChapter ? (
            <article
              className="chapter-panel"
              data-game-type={currentChapter.gameType}
              aria-live="polite"
            >
              <p className="eyebrow">
                Chương {session.currentChapter + 1} · {CHAPTER_GAME_LABELS[currentChapter.gameType]}
              </p>
              <h2>{currentChapter.title}</h2>
              <p>{currentChapter.scene}</p>
              {currentChapter.gameType === "memory_piece" || currentChapter.gameType === "detail_hunt" ? (
                <PixelMemoryQuest
                  key={currentChapterKey}
                  images={currentChapter.memoryImages}
                  pixelQuest={currentChapter.pixelQuest}
                  recipientName={session.selectedName}
                  childCharacter={selectedRecipient?.childCharacter ?? {
                    name: `Bé ${session.selectedName}`,
                    trait: "Tò mò, thích khám phá những điều thân quen",
                    archetype: "princess",
                  }}
                  accent={selectedRecipient?.accent ?? "pear"}
                  sessionToken={session.token}
                  sessionId={session.remoteSessionId ?? session.recipientId ?? ""}
                  chapterId={currentChapterKey}
                />
              ) : null}
              <div className="prompt-line">{currentChapter.prompt}</div>
              <div className="choice-stack">
                {currentChapter.choices.map((choice) => (
                  <button
                    type="button"
                    aria-busy={choiceStatus === "loading" && pendingChoiceId === choice.id}
                    key={choice.id}
                    className={
                      answeredCurrent === choice.id
                        || pendingChoiceId === choice.id
                        ? "choice-button is-selected"
                        : "choice-button"
                    }
                    onClick={() => selectChoice(currentChapter, choice)}
                    disabled={choiceStatus === "loading" || Boolean(answeredCurrent)}
                  >
                    <span>{choice.label}</span>
                    {answeredCurrent === choice.id ? (
                      <Check size={18} aria-hidden="true" />
                    ) : null}
                  </button>
                ))}
              </div>
              {feedbackMessage ? (
                <p
                  className={
                    choiceStatus === "error" ? "story-reply is-error" : "story-reply"
                  }
                  role={choiceStatus === "error" ? "alert" : "status"}
                >
                  {feedbackMessage}
                </p>
              ) : null}
              <div className="chapter-actions">
                <button
                  type="button"
                  onClick={goToNextChapter}
                  disabled={!answeredCurrent}
                >
                  <span>
                    {session.currentChapter === chapterCount - 1
                      ? "Đến trang quà"
                      : "Tiếp"}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </article>
          ) : (
            <article className="voucher-panel" aria-labelledby="voucher-title">
              <p className="eyebrow">Trang cuối</p>
              <h2 id="voucher-title">Voucher của {session.selectedName}</h2>
              <p>
                Bốn chương đã hoàn tất. Mã quà chỉ xuất hiện sau khi máy chủ kiểm tra lại
                toàn bộ hành trình.
              </p>

              <form className="voucher-form" onSubmit={completeSession}>
                {completeStatus === "error" ? (
                  <p className="api-message is-error" role="alert">
                    <AlertCircle size={18} aria-hidden="true" />
                    <span>{feedbackMessage}</span>
                  </p>
                ) : null}
                {completeStatus === "success" && session.voucher ? (
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
                ) : null}

                <div className="chapter-actions">
                  <button
                    type="submit"
                    aria-busy={completeStatus === "loading"}
                    disabled={completeStatus === "loading"}
                  >
                    {completeStatus === "loading" ? (
                      <Loader2 className="spin-icon" size={18} aria-hidden="true" />
                    ) : (
                      <Gift size={18} aria-hidden="true" />
                    )}
                    <span>Mở voucher</span>
                  </button>
                </div>
              </form>
            </article>
          )}
        </section>
      </section>

      <footer className="birthday-footer">
        <button type="button" className="ghost-button" onClick={resetSession}>
          <RefreshCcw size={18} aria-hidden="true" />
          <span>Chọn tên khác</span>
        </button>
        <span>
          Tiến độ: {completedCount}/{chapterCount}
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
