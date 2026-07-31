"use client";

/* The game restores local UI state and updates a frame-loop ref by design. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Check, CircleHelp, Loader2, LockKeyhole, MapPin, Pause, Play, RotateCcw, X } from "lucide-react";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";
import type {
  PixelCharacterArchetype,
  PublicChildCharacterDTO,
  PublicMemoryImageDTO,
  PublicPixelQuestConfigDTO,
  PublicPixelQuestZoneDTO,
} from "@/lib/birthday/types";
import type { ApiStatus } from "./types";
import { initialsFromName } from "./content";
import {
  createPixelQuestState,
  isMemoryStationEnabled,
  isMemoryStationVisited,
  pixelQuestProgress,
  pixelQuestReducer,
} from "./pixel-quest";
import { MapArtwork, RoyalPixelCharacter } from "./ChildhoodMemoryMap";
import {
  calculateCamera,
  isGamePoint,
  MEMORY_WORLD,
  movePlayer,
  nearestZoneIndex,
  playerStartPoint,
  type GameDirection,
  type GamePoint,
  zoneToWorldPoint,
} from "./memory-game-engine";

type ChildhoodMemoryMapProps = {
  images: PublicMemoryImageDTO[];
  pixelQuest?: PublicPixelQuestConfigDTO;
  recipientName: string;
  childCharacter: PublicChildCharacterDTO;
  accent: "pear" | "cyan" | "coral";
  sessionId: string;
  completedChapterCount: number;
  voucherRevealed: boolean;
  status: ApiStatus;
  errorMessage?: string;
  onOpenStation: (
    stationIndex: number,
    zone: PublicPixelQuestZoneDTO,
    moveCount: number,
  ) => Promise<void> | void;
};

type PersistedWorldState = {
  version: 1;
  position: GamePoint;
  direction: GameDirection;
  tutorialSeen: boolean;
};

const WORLD_STATE_VERSION = 1 as const;

const CHARACTER_LABELS: Record<PixelCharacterArchetype, string> = {
  princess: "Công chúa nhí",
  prince: "Hoàng tử nhí",
  emperor: "Hoàng thượng nhí",
  knight: "Kỵ sĩ nhí",
};

const DIRECTIONS: GameDirection[] = ["up", "down", "left", "right"];

function directionFromKey(key: string): GameDirection | null {
  switch (key.toLowerCase()) {
    case "arrowup":
    case "w":
      return "up";
    case "arrowdown":
    case "s":
      return "down";
    case "arrowleft":
    case "a":
      return "left";
    case "arrowright":
    case "d":
      return "right";
    default:
      return null;
  }
}

function isPersistedWorldState(value: unknown): value is PersistedWorldState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === WORLD_STATE_VERSION
    && isGamePoint(candidate.position)
    && typeof candidate.direction === "string"
    && DIRECTIONS.includes(candidate.direction as GameDirection)
    && typeof candidate.tutorialSeen === "boolean";
}

function clampWorldPoint(point: GamePoint): GamePoint {
  return {
    x: Math.min(MEMORY_WORLD.width - MEMORY_WORLD.playerRadius, Math.max(MEMORY_WORLD.playerRadius, point.x)),
    y: Math.min(MEMORY_WORLD.height - MEMORY_WORLD.playerRadius, Math.max(MEMORY_WORLD.playerRadius, point.y)),
  };
}

export function ChildhoodMemoryMapGame({
  images,
  pixelQuest = DEFAULT_PIXEL_QUEST,
  recipientName,
  childCharacter,
  accent,
  sessionId,
  completedChapterCount,
  voucherRevealed,
  status,
  errorMessage = "",
  onOpenStation,
}: ChildhoodMemoryMapProps) {
  const frames = Array.from({ length: 5 }, (_, index) => images[index] ?? null);
  const journeyId = sessionId || `local-${recipientName}`;
  const progressStorageKey = `happybirthday.memoryMap.${journeyId}`;
  const worldStorageKey = `happybirthday.memoryMapWorld.v1.${journeyId}`;
  const legacyPositionStorageKey = `happybirthday.memoryMapPosition.${journeyId}`;
  const firstZone = pixelQuest.zones[0] ?? DEFAULT_PIXEL_QUEST.zones[0]!;
  const [questState, dispatchQuest] = useState(() => createPixelQuestState(journeyId, pixelQuest));
  const [playerPosition, setPlayerPosition] = useState<GamePoint>(() => playerStartPoint(firstZone));
  const [playerDirection, setPlayerDirection] = useState<GameDirection>("down");
  const [playerMoving, setPlayerMoving] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [sceneIndex, setSceneIndex] = useState<number | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const sceneCloseRef = useRef<HTMLButtonElement | null>(null);
  const heldDirectionsRef = useRef<Set<GameDirection>>(new Set());
  const activeDirectionRef = useRef<GameDirection>("down");
  const playerPositionRef = useRef(playerPosition);
  const moveCountRef = useRef(0);

  const questReducerDispatch = (action: Parameters<typeof pixelQuestReducer>[1]) => {
    dispatchQuest((current) => pixelQuestReducer(current, action));
  };

  const activeIndex = Math.max(0, pixelQuest.zones.findIndex((zone) => zone.id === questState.activeCheckpointId));
  const activeZone = pixelQuest.zones[activeIndex] ?? firstZone;
  const activeImage = frames[activeIndex];
  const activeVisited = isMemoryStationVisited(activeIndex, completedChapterCount, voucherRevealed);
  const nearbyIndex = nearestZoneIndex(playerPosition, pixelQuest.zones);
  const nearbyZone = nearbyIndex >= 0 ? pixelQuest.zones[nearbyIndex] : null;
  const nearbyEnabled = nearbyIndex >= 0 && isMemoryStationEnabled(nearbyIndex, completedChapterCount, pixelQuest.zones.length);
  const visitedCount = pixelQuest.zones.filter((_, index) => isMemoryStationVisited(index, completedChapterCount, voucherRevealed)).length;
  const camera = useMemo(() => calculateCamera(playerPosition, viewport), [playerPosition, viewport]);
  const worldStyle = {
    width: `${MEMORY_WORLD.width}px`,
    height: `${MEMORY_WORLD.height}px`,
    transform: `translate3d(-${camera.x}px, -${camera.y}px, 0)`,
  } as CSSProperties;

  useEffect(() => {
    const raw = window.localStorage.getItem(worldStorageKey);
    let restored: PersistedWorldState | null = null;
    try {
      const candidate = raw ? JSON.parse(raw) as unknown : null;
      if (isPersistedWorldState(candidate)) restored = candidate;
    } catch {
      window.localStorage.removeItem(worldStorageKey);
    }

    if (restored) {
      setPlayerPosition(clampWorldPoint(restored.position));
      setPlayerDirection(restored.direction);
      activeDirectionRef.current = restored.direction;
      setTutorialOpen(!restored.tutorialSeen);
    } else {
      const legacyRaw = window.localStorage.getItem(legacyPositionStorageKey);
      try {
        const legacy = legacyRaw ? JSON.parse(legacyRaw) as unknown : null;
        if (isGamePoint(legacy)) setPlayerPosition(clampWorldPoint(legacy));
      } catch {
        window.localStorage.removeItem(legacyPositionStorageKey);
      }
    }
  }, [legacyPositionStorageKey, worldStorageKey]);

  useEffect(() => {
    const raw = window.localStorage.getItem(progressStorageKey);
    try {
      questReducerDispatch({
        type: "restore",
        progress: raw ? JSON.parse(raw) as unknown : null,
        completedChapterCount,
        config: pixelQuest,
      });
    } catch {
      window.localStorage.removeItem(progressStorageKey);
      questReducerDispatch({ type: "hydrate" });
    }
  }, [completedChapterCount, pixelQuest, progressStorageKey]);

  useEffect(() => {
    questReducerDispatch({ type: "sync", completedChapterCount, config: pixelQuest });
  }, [completedChapterCount, pixelQuest]);

  useEffect(() => {
    window.localStorage.setItem(progressStorageKey, JSON.stringify(pixelQuestProgress(questState)));
  }, [progressStorageKey, questState]);

  useEffect(() => {
    const state: PersistedWorldState = {
      version: WORLD_STATE_VERSION,
      position: playerPosition,
      direction: playerDirection,
      tutorialSeen: !tutorialOpen,
    };
    window.localStorage.setItem(worldStorageKey, JSON.stringify(state));
  }, [playerDirection, playerPosition, tutorialOpen, worldStorageKey]);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return undefined;
    const updateViewport = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    updateViewport();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateViewport);
      return () => window.removeEventListener("resize", updateViewport);
    }
    const observer = new ResizeObserver(updateViewport);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const clearHeld = () => {
      heldDirectionsRef.current.clear();
      setPlayerMoving(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") clearHeld();
    };
    window.addEventListener("blur", clearHeld);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", clearHeld);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const shouldMove = !pauseOpen && !tutorialOpen && sceneIndex === null && heldDirectionsRef.current.size > 0;
      if (shouldMove) {
        const direction = activeDirectionRef.current;
        const next = movePlayer(playerPositionRef.current, direction, MEMORY_WORLD.speed * deltaSeconds);
        if (next.x !== playerPositionRef.current.x || next.y !== playerPositionRef.current.y) {
          playerPositionRef.current = next;
          setPlayerPosition(next);
        }
        setPlayerMoving(true);
      } else {
        setPlayerMoving(false);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [pauseOpen, sceneIndex, tutorialOpen]);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    if (sceneIndex !== null) sceneCloseRef.current?.focus();
  }, [sceneIndex]);

  function dismissTutorial() {
    setTutorialOpen(false);
    mapRef.current?.focus({ preventScroll: true });
  }

  function setHeldDirection(direction: GameDirection, held: boolean) {
    if (held) {
      activeDirectionRef.current = direction;
      setPlayerDirection(direction);
      heldDirectionsRef.current.add(direction);
    } else {
      heldDirectionsRef.current.delete(direction);
    }
  }

  function selectStation(index: number, shouldOpen: boolean) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)) return;
    const nextMoveCount = moveCountRef.current + (zone.id === questState.activeCheckpointId ? 0 : 1);
    moveCountRef.current = nextMoveCount;
    questReducerDispatch({ type: "select", checkpointId: zone.id, completedChapterCount, config: pixelQuest });
    if (!shouldOpen) return;
    setSceneIndex(index);
    setPauseOpen(false);
    if (!isMemoryStationVisited(index, completedChapterCount, voucherRevealed)) {
      void onOpenStation(index, zone, nextMoveCount);
    }
  }

  function travelToStation(index: number, shouldOpen: boolean) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)) return;
    const target = playerStartPoint(zone);
    setPlayerPosition(target);
    playerPositionRef.current = target;
    const station = zoneToWorldPoint(zone);
    const dx = station.x - playerPosition.x;
    setPlayerDirection(Math.abs(dx) < 12 ? "down" : dx < 0 ? "left" : "right");
    selectStation(index, shouldOpen);
  }

  function interactWithNearbyStation() {
    if (nearbyIndex < 0 || !nearbyEnabled || status === "loading") return;
    selectStation(nearbyIndex, true);
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setPauseOpen((current) => !current);
      heldDirectionsRef.current.clear();
      return;
    }
    if (event.key === "?" || event.key === "h") {
      event.preventDefault();
      setTutorialOpen(true);
      return;
    }
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      if (tutorialOpen) dismissTutorial();
      if (!pauseOpen && sceneIndex === null) {
        const nudge = movePlayer(playerPositionRef.current, direction, MEMORY_WORLD.width * 0.0225);
        playerPositionRef.current = nudge;
        setPlayerPosition(nudge);
        setHeldDirection(direction, true);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (tutorialOpen) dismissTutorial();
      interactWithNearbyStation();
    }
  }

  const sceneImage = sceneIndex === null ? null : frames[sceneIndex];
  const sceneZone = sceneIndex === null ? null : pixelQuest.zones[sceneIndex];

  return (
    <section className="childhood-map" aria-labelledby="childhood-map-title" data-complete={voucherRevealed}>
      <header className="childhood-map__intro">
        <div>
          <p>Memory Atlas 2000 · 5 trạm</p>
          <h2 id="childhood-map-title">Bản đồ tuổi thơ của {recipientName}</h2>
        </div>
        <p>Khám phá tự do trên một thế giới pixel rộng. Mỗi trạm mở một lát cắt ký ức; không câu hỏi, không game over.</p>
      </header>

      <div
        ref={mapRef}
        className="childhood-map__viewport"
        role="group"
        tabIndex={0}
        aria-label={`Bản đồ ký ức của ${recipientName}. Dùng WASD hoặc phím mũi tên để di chuyển. Nhấn Enter để mở trạm gần nhất.`}
        data-camera-x={Math.round(camera.x)}
        data-camera-y={Math.round(camera.y)}
        onKeyDown={handleMapKeyDown}
        onPointerDown={() => mapRef.current?.focus({ preventScroll: true })}
        onKeyUp={(event) => {
          const direction = directionFromKey(event.key);
          if (direction) setHeldDirection(direction, false);
        }}
      >
        <div className="childhood-map__world" style={worldStyle}>
          <MapArtwork />
          <div className="childhood-map__route" aria-hidden="true" />
          {pixelQuest.zones.map((zone, index) => {
            const enabled = isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length);
            const visited = isMemoryStationVisited(index, completedChapterCount, voucherRevealed);
            const active = index === activeIndex;
            const target = zoneToWorldPoint(zone);
            const stationStyle = { left: `${target.x}px`, top: `${target.y}px` } as CSSProperties;
            return (
              <button
                key={zone.id}
                type="button"
                className="childhood-map__station"
                style={stationStyle}
                data-scene={zone.scene}
                data-active={active}
                data-nearby={index === nearbyIndex}
                data-visited={visited}
                data-enabled={enabled}
                aria-label={`${visited ? "Xem lại" : enabled ? "Khám phá" : "Chưa mở"} trạm ${index + 1}: ${zone.title}`}
                aria-pressed={active}
                aria-busy={active && status === "loading"}
                disabled={!enabled || status === "loading"}
                onClick={() => travelToStation(index, true)}
              >
                <span className="childhood-map__station-marker" data-kind={visited ? "visited" : index === 4 ? "gift" : "memory"} aria-hidden="true">
                  <span className="childhood-map__station-pixel-icon" />
                </span>
                <span className="childhood-map__station-label" aria-hidden="true">
                  <small>0{index + 1}</small>
                  <strong>{zone.title}</strong>
                </span>
              </button>
            );
          })}

          <div
            className={`childhood-map__character tone-${accent} archetype-${childCharacter.archetype}`}
            style={{
              left: `${playerPosition.x}px`,
              top: `${playerPosition.y}px`,
              "--character-x": `${(playerPosition.x / MEMORY_WORLD.width) * 100}%`,
              "--character-y": `${(playerPosition.y / MEMORY_WORLD.height) * 100}%`,
            } as CSSProperties}
            data-ready
            data-moving={playerMoving}
            data-direction={playerDirection}
            aria-hidden="true"
          >
            <RoyalPixelCharacter initial={initialsFromName(recipientName).slice(0, 1)} />
          </div>
        </div>

        <div className="childhood-map__hud">
          <div className="childhood-map__hud-copy"><span>MAP 08</span><strong>{visitedCount}/5 mảnh ký ức</strong><small>{voucherRevealed ? <><span>GIFT OPEN</span> · VOUCHER ĐÃ MỞ</> : nearbyZone ? `GẦN TRẠM ${String(nearbyIndex + 1).padStart(2, "0")}` : "ĐANG KHÁM PHÁ"}</small></div>
          <div className="childhood-map__hud-shards" aria-label={`${visitedCount} trên 5 trạm đã mở`}>
            {pixelQuest.zones.map((zone, index) => <span key={zone.id} data-filled={isMemoryStationVisited(index, completedChapterCount, voucherRevealed)}>{String(index + 1).padStart(2, "0")}</span>)}
          </div>
          <button type="button" className="childhood-map__pause" aria-label={pauseOpen ? "Tiếp tục hành trình" : "Tạm dừng hành trình"} onClick={() => setPauseOpen((current) => !current)}>
            {pauseOpen ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          </button>
        </div>

        {nearbyZone ? (
          <div className="childhood-map__proximity" data-visible="true" data-locked={!nearbyEnabled} role="status" aria-live="polite">
            <span>{nearbyEnabled ? "ENTER" : "LOCK"}</span>
            <strong>{nearbyEnabled ? `Khám phá ${nearbyZone.title}` : "Mở sau trạm trước"}</strong>
          </div>
        ) : null}

        {tutorialOpen ? (
          <aside className="childhood-map__tutorial" role="note">
            <div><CircleHelp size={18} aria-hidden="true" /><strong>Bắt đầu cuộc dạo chơi</strong></div>
            <p>WASD / phím mũi tên để đi. Tới gần biểu tượng ký ức rồi nhấn Enter.</p>
            <button type="button" onClick={dismissTutorial}>Đã hiểu</button>
          </aside>
        ) : null}

        {pauseOpen ? (
          <div className="childhood-map__pause-panel" role="dialog" aria-modal="true" aria-labelledby="memory-map-pause-title">
            <div className="childhood-map__pause-card">
              <span className="childhood-map__story-heading"><span>TẠM DỪNG</span><strong id="memory-map-pause-title">Đứng lại một chút</strong></span>
              <p>Vị trí và những mảnh ký ức đã mở được giữ lại trên thiết bị này.</p>
              <button type="button" className="childhood-map__interact" onClick={() => setPauseOpen(false)}><Play size={16} aria-hidden="true" /> Tiếp tục</button>
            </div>
          </div>
        ) : null}

        {sceneIndex !== null && sceneZone ? (
          <div className="childhood-map__scene" role="dialog" aria-modal="true" aria-labelledby="memory-scene-title">
            <div className="childhood-map__scene-card">
              <div className="childhood-map__scene-topline"><span>TRẠM {String(sceneIndex + 1).padStart(2, "0")}</span><button type="button" aria-label="Đóng cảnh ký ức" onClick={() => setSceneIndex(null)}><X size={18} aria-hidden="true" /></button></div>
              <div className="childhood-map__scene-body">
                <div className="childhood-map__scene-photo">
                  {sceneImage ? <Image src={sceneImage.url} alt={sceneImage.alt} width={520} height={360} sizes="(max-width: 640px) 82vw, 420px" unoptimized /> : <div className="childhood-map__photo-placeholder"><span aria-hidden="true" /><strong>Khung ảnh ký ức</strong><small>Thêm ảnh tuổi thơ trong trang quản trị.</small></div>}
                </div>
                <div className="childhood-map__scene-copy">
                  <p>{sceneZone.scene}</p>
                  <h3 id="memory-scene-title">{sceneZone.title}</h3>
                  <blockquote>{sceneImage?.caption || sceneZone.npcLine}</blockquote>
                  <p className="childhood-map__scene-character">{childCharacter.name} · {CHARACTER_LABELS[childCharacter.archetype]} · {childCharacter.trait}</p>
                  <button ref={sceneCloseRef} type="button" className="childhood-map__interact" disabled={status === "loading"} onClick={() => setSceneIndex(null)}>
                    {status === "loading" ? <><Loader2 size={16} className="spin-icon" aria-hidden="true" /> Đang lưu...</> : activeVisited ? <><Check size={16} aria-hidden="true" /> Tiếp tục khám phá</> : <><MapPin size={16} aria-hidden="true" /> Giữ mảnh ký ức</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="childhood-map__controls" aria-label="Điều khiển nhân vật">
        <div className="childhood-map__dpad">
          {(["up", "left", "down", "right"] as const).map((direction) => (
            <button key={direction} type="button" className={`childhood-map__move childhood-map__move--${direction}`} aria-label={`Di chuyển ${direction === "up" ? "lên" : direction === "down" ? "xuống" : direction === "left" ? "trái" : "phải"}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dismissTutorial(); setHeldDirection(direction, true); }} onPointerUp={() => setHeldDirection(direction, false)} onPointerCancel={() => setHeldDirection(direction, false)}>
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="childhood-map__control-copy"><span>WASD / ARROWS</span><strong>Đi tự do trong bản đồ</strong><small>Tới gần trạm rồi nhấn Enter hoặc nút Khám phá.</small></div>
        <button type="button" className="childhood-map__interact" data-state={status === "loading" ? "loading" : status === "error" ? "error" : nearbyEnabled ? "ready" : "disabled"} disabled={!nearbyEnabled || status === "loading"} onClick={interactWithNearbyStation}>{status === "loading" ? <><Loader2 size={16} className="spin-icon" aria-hidden="true" /> Đang mở...</> : "Khám phá"}<kbd>Enter</kbd></button>
      </div>

      <div className="childhood-map__details" data-scene={activeZone.scene}>
        <div className="childhood-map__photo">
          {activeImage ? <Image src={activeImage.url} alt={activeImage.alt} width={720} height={540} sizes="(max-width: 640px) 92vw, 560px" unoptimized /> : <div className="childhood-map__photo-placeholder" aria-label="Chưa có ảnh thật cho trạm này"><span aria-hidden="true" /><strong>Khung ảnh ký ức</strong><small>Admin có thể thêm ảnh thật cho đúng trạm.</small></div>}
        </div>
        <div className="childhood-map__story"><div className="childhood-map__story-heading"><span>Trạm {String(activeIndex + 1).padStart(2, "0")}</span><strong>{activeZone.title}</strong></div><p>{activeImage?.caption || activeZone.npcLine}</p><dl><div><dt>Nhân vật</dt><dd>{childCharacter.name} · {CHARACTER_LABELS[childCharacter.archetype]}</dd></div><div><dt>Tính cách</dt><dd>{childCharacter.trait}</dd></div></dl><div className="childhood-map__status" role="status" aria-live="polite">{status === "loading" ? <><Loader2 className="spin-icon" size={18} aria-hidden="true" /> Đang cất mảnh ký ức này…</> : status === "error" && errorMessage ? <><LockKeyhole size={18} aria-hidden="true" /> {errorMessage}</> : activeVisited ? <><Check size={18} aria-hidden="true" /> {activeIndex === 4 ? "Voucher đã mở." : "Mảnh ký ức đã được giữ lại."}</> : <><MapPin size={18} aria-hidden="true" /> Tới trạm trên bản đồ để mở ký ức.</>}</div>{status === "error" && !activeVisited ? <button type="button" className="childhood-map__retry" onClick={() => selectStation(activeIndex, true)}><RotateCcw size={18} aria-hidden="true" /><span>Thử lại trạm này</span></button> : null}</div>
      </div>

      <ol className="childhood-map__legend" aria-label="Năm trạm ký ức">
        {pixelQuest.zones.map((zone, index) => {
          const visited = isMemoryStationVisited(index, completedChapterCount, voucherRevealed);
          const enabled = isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length);
          return <li key={zone.id} data-active={index === activeIndex} data-visited={visited}><span>0{index + 1}</span><div><strong>{zone.title}</strong><small>{visited ? "Đã khám phá" : enabled ? "Đang chờ bạn" : "Mở sau trạm trước"}</small></div></li>;
        })}
      </ol>
    </section>
  );
}
