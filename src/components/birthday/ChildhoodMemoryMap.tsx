"use client";

import {
  CSSProperties,
  KeyboardEvent,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Check, Loader2, LockKeyhole, MapPin, RotateCcw } from "lucide-react";
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
  maximumReachableStationIndex,
  pixelQuestProgress,
  pixelQuestReducer,
} from "./pixel-quest";

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

type PlayerDirection = "up" | "down" | "left" | "right";

type PlayerPosition = {
  x: number;
  y: number;
};

const PLAYER_STEP_PERCENT = 2.25;
const STATION_INTERACTION_RADIUS = 8.5;
const PLAYER_BOUNDS = {
  minX: 4,
  maxX: 96,
  minY: 12,
  maxY: 94,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPlayerPosition(value: unknown): value is PlayerPosition {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const position = value as Record<string, unknown>;
  return typeof position.x === "number"
    && Number.isFinite(position.x)
    && typeof position.y === "number"
    && Number.isFinite(position.y);
}

function stationDistance(position: PlayerPosition, zone: PublicPixelQuestZoneDTO) {
  const deltaX = position.x - zone.mapXPercent;
  const deltaY = (position.y - zone.mapYPercent) * 1.3;
  return Math.hypot(deltaX, deltaY);
}

function nearestStationIndex(
  position: PlayerPosition,
  zones: PublicPixelQuestZoneDTO[],
) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  zones.forEach((zone, index) => {
    const distance = stationDistance(position, zone);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestDistance <= STATION_INTERACTION_RADIUS ? nearestIndex : -1;
}

const CHARACTER_LABELS: Record<PixelCharacterArchetype, string> = {
  princess: "Công chúa nhí",
  prince: "Hoàng tử nhí",
  emperor: "Hoàng thượng nhí",
  knight: "Kỵ sĩ nhí",
};

export function ChildhoodMemoryMap({
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
  const positionStorageKey = `happybirthday.memoryMapPosition.${journeyId}`;
  const [questState, dispatchQuest] = useReducer(
    pixelQuestReducer,
    undefined,
    () => createPixelQuestState(journeyId, pixelQuest),
  );
  const firstZone = pixelQuest.zones[0] ?? DEFAULT_PIXEL_QUEST.zones[0]!;
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(positionStorageKey);
        const storedPosition = raw ? JSON.parse(raw) as unknown : null;
        if (isPlayerPosition(storedPosition)) {
          return {
            x: clamp(storedPosition.x, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX),
            y: clamp(storedPosition.y, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY),
          };
        }
      } catch {
        window.localStorage.removeItem(positionStorageKey);
      }
    }

    return {
      x: clamp(firstZone.mapXPercent + 4, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX),
      y: clamp(firstZone.mapYPercent + 5, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY),
    };
  });
  const [playerDirection, setPlayerDirection] = useState<PlayerDirection>("down");
  const [playerMoving, setPlayerMoving] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stationRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const moveIntervalRef = useRef<number | null>(null);
  const movementStopRef = useRef<number | null>(null);
  const maximumIndex = maximumReachableStationIndex(
    completedChapterCount,
    pixelQuest.zones.length,
  );
  const activeIndex = Math.max(
    0,
    pixelQuest.zones.findIndex((zone) => zone.id === questState.activeCheckpointId),
  );
  const activeZone = pixelQuest.zones[activeIndex] ?? pixelQuest.zones[0];
  const activeImage = frames[activeIndex];
  const activeVisited = isMemoryStationVisited(
    activeIndex,
    completedChapterCount,
    voucherRevealed,
  );
  const activeLoading = status === "loading" && !activeVisited;
  const nearbyIndex = nearestStationIndex(playerPosition, pixelQuest.zones);
  const nearbyZone = nearbyIndex >= 0 ? pixelQuest.zones[nearbyIndex] : null;
  const nearbyEnabled = nearbyIndex >= 0 && isMemoryStationEnabled(
    nearbyIndex,
    completedChapterCount,
    pixelQuest.zones.length,
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(progressStorageKey);
      dispatchQuest({
        type: "restore",
        progress: raw ? JSON.parse(raw) as unknown : null,
        completedChapterCount,
        config: pixelQuest,
      });
    } catch {
      window.localStorage.removeItem(progressStorageKey);
      dispatchQuest({ type: "hydrate" });
    }
  }, [completedChapterCount, pixelQuest, progressStorageKey]);

  useEffect(() => {
    dispatchQuest({
      type: "sync",
      completedChapterCount,
      config: pixelQuest,
    });
  }, [completedChapterCount, pixelQuest]);

  useEffect(() => {
    if (!questState.hydrated) return;
    window.localStorage.setItem(
      progressStorageKey,
      JSON.stringify(pixelQuestProgress(questState)),
    );
  }, [progressStorageKey, questState]);

  useEffect(() => {
    window.localStorage.setItem(positionStorageKey, JSON.stringify(playerPosition));
  }, [playerPosition, positionStorageKey]);

  useEffect(() => () => {
    if (moveIntervalRef.current !== null) {
      window.clearInterval(moveIntervalRef.current);
    }
    if (movementStopRef.current !== null) {
      window.clearTimeout(movementStopRef.current);
    }
  }, []);

  function selectStation(index: number, shouldOpen: boolean) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(
      index,
      completedChapterCount,
      pixelQuest.zones.length,
    )) {
      return;
    }

    const nextMoveCount = questState.moveCount + (
      zone.id === questState.activeCheckpointId ? 0 : 1
    );
    dispatchQuest({
      type: "select",
      checkpointId: zone.id,
      completedChapterCount,
      config: pixelQuest,
    });

    if (shouldOpen && !isMemoryStationVisited(
      index,
      completedChapterCount,
      voucherRevealed,
    )) {
      void onOpenStation(index, zone, nextMoveCount);
    }
  }

  function markPlayerMoving() {
    setPlayerMoving(true);
    if (movementStopRef.current !== null) {
      window.clearTimeout(movementStopRef.current);
    }
    movementStopRef.current = window.setTimeout(() => {
      setPlayerMoving(false);
      movementStopRef.current = null;
    }, 180);
  }

  function movePlayer(direction: PlayerDirection) {
    const delta = {
      up: { x: 0, y: -PLAYER_STEP_PERCENT },
      down: { x: 0, y: PLAYER_STEP_PERCENT },
      left: { x: -PLAYER_STEP_PERCENT, y: 0 },
      right: { x: PLAYER_STEP_PERCENT, y: 0 },
    }[direction];

    setPlayerDirection(direction);
    markPlayerMoving();
    setPlayerPosition((current) => ({
      x: clamp(current.x + delta.x, PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX),
      y: clamp(current.y + delta.y, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY),
    }));
  }

  function stopContinuousMove() {
    if (moveIntervalRef.current !== null) {
      window.clearInterval(moveIntervalRef.current);
      moveIntervalRef.current = null;
    }
    setPlayerMoving(false);
  }

  function startContinuousMove(direction: PlayerDirection) {
    stopContinuousMove();
    movePlayer(direction);
    moveIntervalRef.current = window.setInterval(() => movePlayer(direction), 100);
  }

  function interactWithNearbyStation() {
    if (nearbyIndex < 0 || !nearbyEnabled || status === "loading") return;
    selectStation(nearbyIndex, true);
  }

  function travelToStation(index: number, shouldOpen: boolean) {
    const zone = pixelQuest.zones[index];
    if (!zone) return;

    setPlayerDirection(zone.mapXPercent < playerPosition.x ? "left" : "right");
    markPlayerMoving();
    setPlayerPosition({
      x: clamp(zone.mapXPercent + (index < 3 ? 4 : -4), PLAYER_BOUNDS.minX, PLAYER_BOUNDS.maxX),
      y: clamp(zone.mapYPercent + 5, PLAYER_BOUNDS.minY, PLAYER_BOUNDS.maxY),
    });
    selectStation(index, shouldOpen);
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).tagName === "BUTTON") return;

    const key = event.key.toLowerCase();
    const direction = key === "arrowup" || key === "w"
      ? "up"
      : key === "arrowdown" || key === "s"
        ? "down"
        : key === "arrowleft" || key === "a"
          ? "left"
          : key === "arrowright" || key === "d"
            ? "right"
            : null;

    if (direction) {
      event.preventDefault();
      movePlayer(direction);
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      interactWithNearbyStation();
    } else if (event.key === "Home") {
      event.preventDefault();
      travelToStation(0, false);
    } else if (event.key === "End") {
      event.preventDefault();
      travelToStation(maximumIndex, false);
    }
  }

  const mapStyle = {
    "--map-ratio": `${pixelQuest.mapWidthPx} / ${pixelQuest.mapHeightPx}`,
  } as CSSProperties;
  const characterStyle = {
    "--character-x": `${playerPosition.x}%`,
    "--character-y": `${playerPosition.y}%`,
  } as CSSProperties;

  return (
    <section
      className="childhood-map"
      aria-labelledby="childhood-map-title"
      data-complete={voucherRevealed}
    >
      <header className="childhood-map__intro">
        <div>
          <p>Memory Atlas 2000 · 5 trạm</p>
          <h2 id="childhood-map-title">Bản đồ tuổi thơ của {recipientName}</h2>
        </div>
        <p>
          Đi theo đường chấm, mở từng nơi thân quen. Không câu hỏi, không game over.
        </p>
      </header>

      <div
        ref={mapRef}
        className="childhood-map__viewport"
        style={mapStyle}
        role="group"
        aria-label={`Bản đồ ký ức của ${recipientName}. Dùng WASD hoặc phím mũi tên để di chuyển. Nhấn Enter khi tới gần một trạm.`}
        tabIndex={0}
        onKeyDown={handleMapKeyDown}
      >
        <MapArtwork />
        <div className="childhood-map__route" aria-hidden="true" />

        {pixelQuest.zones.map((zone, index) => {
          const enabled = isMemoryStationEnabled(
            index,
            completedChapterCount,
            pixelQuest.zones.length,
          );
          const visited = isMemoryStationVisited(
            index,
            completedChapterCount,
            voucherRevealed,
          );
          const active = index === activeIndex;
          const stationStyle = {
            "--station-x": `${zone.mapXPercent}%`,
            "--station-y": `${zone.mapYPercent}%`,
          } as CSSProperties;

          return (
            <button
              ref={(node) => { stationRefs.current[index] = node; }}
              type="button"
              className="childhood-map__station"
              style={stationStyle}
              data-scene={zone.scene}
              data-active={active}
              data-nearby={index === nearbyIndex}
              data-visited={visited}
              data-enabled={enabled}
              key={zone.id}
              aria-label={`${visited ? "Xem lại" : enabled ? "Khám phá" : "Chưa mở"} trạm ${index + 1}: ${zone.title}`}
              aria-pressed={active}
              aria-busy={active && activeLoading}
              disabled={!enabled || status === "loading"}
              onClick={() => travelToStation(index, true)}
            >
              <span
                className="childhood-map__station-marker"
                data-kind={visited ? "visited" : index === 4 ? "gift" : "memory"}
                aria-hidden="true"
              >
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
          style={characterStyle}
          data-ready={questState.hydrated}
          data-moving={playerMoving}
          data-direction={playerDirection}
          aria-hidden="true"
        >
          <RoyalPixelCharacter
            initial={initialsFromName(recipientName).slice(0, 1)}
          />
        </div>

        <div
          className="childhood-map__proximity"
          data-visible={nearbyZone !== null}
          data-locked={nearbyZone !== null && !nearbyEnabled}
          role="status"
          aria-live="polite"
        >
          {nearbyZone ? (
            <>
              <span>{nearbyEnabled ? "ENTER" : "LOCK"}</span>
              <strong>{nearbyEnabled ? `Khám phá ${nearbyZone.title}` : "Mở sau trạm trước"}</strong>
            </>
          ) : (
            <strong>Đi tới biểu tượng trạm ký ức</strong>
          )}
        </div>

        <div className="childhood-map__hud" aria-hidden="true">
          <span>MAP 08</span>
          <span>MEM {Math.min(completedChapterCount, 4)}/4</span>
          <span>{voucherRevealed ? "GIFT OPEN" : nearbyZone ? `NEAR ${String(nearbyIndex + 1).padStart(2, "0")}` : "EXPLORE"}</span>
        </div>
      </div>

      <div className="childhood-map__controls" aria-label="Điều khiển nhân vật">
        <div className="childhood-map__dpad">
          {(["up", "left", "down", "right"] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              className={`childhood-map__move childhood-map__move--${direction}`}
              aria-label={`Di chuyển ${direction === "up" ? "lên" : direction === "down" ? "xuống" : direction === "left" ? "trái" : "phải"}`}
              data-direction={direction}
              onPointerDown={() => startContinuousMove(direction)}
              onPointerUp={stopContinuousMove}
              onPointerCancel={stopContinuousMove}
              onPointerLeave={stopContinuousMove}
              onClick={(event) => event.preventDefault()}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
        <div className="childhood-map__control-copy">
          <span>WASD / ARROWS</span>
          <strong>Di chuyển tự do trên bản đồ</strong>
          <small>Tới gần trạm rồi nhấn Enter hoặc nút Khám phá.</small>
        </div>
        <button
          type="button"
          className="childhood-map__interact"
          data-state={status === "loading"
            ? "loading"
            : status === "error"
              ? "error"
              : nearbyIndex === activeIndex && activeVisited
                ? "success"
                : nearbyEnabled
                  ? "ready"
                  : "disabled"}
          disabled={!nearbyEnabled || status === "loading"}
          onClick={interactWithNearbyStation}
        >
          <span>{status === "loading" ? "Đang mở..." : "Khám phá"}</span>
          <kbd>Enter</kbd>
        </button>
      </div>

      <div className="childhood-map__details" data-scene={activeZone.scene}>
        <div className="childhood-map__photo">
          {activeImage ? (
            <Image
              src={activeImage.url}
              alt={activeImage.alt}
              width={720}
              height={540}
              sizes="(max-width: 640px) 92vw, 560px"
              unoptimized
            />
          ) : (
            <div className="childhood-map__photo-placeholder" aria-label="Chưa có ảnh thật cho trạm này">
              <span aria-hidden="true" />
              <strong>Khung ảnh ký ức</strong>
              <small>Admin có thể thêm ảnh thật cho đúng trạm.</small>
            </div>
          )}
        </div>

        <div className="childhood-map__story">
          <div className="childhood-map__story-heading">
            <span>Trạm {String(activeIndex + 1).padStart(2, "0")}</span>
            <strong>{activeZone.title}</strong>
          </div>
          <p>{activeImage?.caption || activeZone.npcLine}</p>
          <dl>
            <div>
              <dt>Nhân vật</dt>
              <dd>{childCharacter.name} · {CHARACTER_LABELS[childCharacter.archetype]}</dd>
            </div>
            <div>
              <dt>Tính cách</dt>
              <dd>{childCharacter.trait}</dd>
            </div>
          </dl>

          <div className="childhood-map__status" role="status" aria-live="polite">
            {activeLoading ? (
              <><Loader2 className="spin-icon" size={18} aria-hidden="true" /> Đang cất mảnh ký ức này…</>
            ) : status === "error" && errorMessage ? (
              <><LockKeyhole size={18} aria-hidden="true" /> {errorMessage}</>
            ) : activeVisited ? (
              <><Check size={18} aria-hidden="true" /> {activeIndex === 4 ? "Voucher đã mở." : "Mảnh ký ức đã được giữ lại."}</>
            ) : (
              <><MapPin size={18} aria-hidden="true" /> Chạm trạm trên bản đồ để mở ký ức.</>
            )}
          </div>

          {status === "error" && !activeVisited ? (
            <button
              type="button"
              className="childhood-map__retry"
              onClick={() => selectStation(activeIndex, true)}
            >
              <RotateCcw size={18} aria-hidden="true" />
              <span>Thử lại trạm này</span>
            </button>
          ) : null}
        </div>
      </div>

      <ol className="childhood-map__legend" aria-label="Năm trạm ký ức">
        {pixelQuest.zones.map((zone, index) => {
          const visited = isMemoryStationVisited(
            index,
            completedChapterCount,
            voucherRevealed,
          );
          const enabled = isMemoryStationEnabled(
            index,
            completedChapterCount,
            pixelQuest.zones.length,
          );
          return (
            <li key={zone.id} data-active={index === activeIndex} data-visited={visited}>
              <span>0{index + 1}</span>
              <div>
                <strong>{zone.title}</strong>
                <small>{visited ? "Đã khám phá" : enabled ? "Đang chờ bạn" : "Mở sau trạm trước"}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const MAP_PIXEL_TREES = [
  [66, 318, "deep"],
  [110, 360, "light"],
  [162, 316, "deep"],
  [214, 354, "light"],
  [268, 300, "deep"],
  [882, 494, "deep"],
  [930, 454, "light"],
  [976, 490, "deep"],
  [1108, 350, "light"],
  [1152, 392, "deep"],
] as const;

const MAP_PIXEL_FLOWERS = [
  [284, 592],
  [312, 616],
  [350, 570],
  [752, 598],
  [782, 620],
  [836, 666],
  [1096, 686],
  [1130, 674],
] as const;

export function MapArtwork() {
  return (
    <svg
      className="childhood-map__art"
      viewBox="0 0 1200 760"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      <defs>
        <pattern id="memory-map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" />
          <path d="M40 0H0V40" />
        </pattern>
        <pattern id="memory-map-grass-pixels" width="96" height="96" patternUnits="userSpaceOnUse">
          <rect x="10" y="12" width="10" height="10" />
          <rect x="54" y="28" width="8" height="8" />
          <rect x="28" y="66" width="12" height="12" />
          <rect x="76" y="70" width="8" height="8" />
        </pattern>
        <pattern id="farm-map-grass" width="16" height="16" patternUnits="userSpaceOnUse">
          <image
            href="/assets/pixel/farm/grass-fill.png"
            width="16"
            height="16"
            preserveAspectRatio="none"
          />
        </pattern>
        <pattern id="farm-map-dirt" width="16" height="16" patternUnits="userSpaceOnUse">
          <image
            href="/assets/pixel/farm/dirt-fill.png"
            width="16"
            height="16"
            preserveAspectRatio="none"
          />
        </pattern>
      </defs>
      <rect className="map-art__grass" width="1200" height="760" />
      <rect
        className="map-art__grass--farm"
        width="1200"
        height="760"
        style={{ fill: "url(#farm-map-grass)" }}
      />
      <rect className="map-art__grid" width="1200" height="760" />
      <rect className="map-art__grass-pixels" width="1200" height="760" />
      <polygon className="map-art__meadow map-art__meadow--one" points="0,468 96,420 196,436 302,492 408,472 520,560 650,618 760,576 872,522 1002,446 1200,486 1200,760 0,760" />
      <polygon className="map-art__meadow map-art__meadow--two" points="0,0 1200,0 1200,174 1086,150 970,186 840,162 716,112 592,142 460,96 332,174 204,226 82,206 0,244" />

      <polyline className="map-art__river" points="470,-20 448,88 504,164 526,252 498,340 432,424 408,512 456,612 564,692 592,800" />
      <polyline className="map-art__river-shine" points="496,4 476,92 532,174 548,252 520,340 456,430 436,512 480,598 584,676 612,790" />

      <polyline className="map-art__road-shadow" points="168,555 260,448 408,327 518,390 636,502 742,372 864,258 976,374 1056,524" />
      <polyline className="map-art__road" points="168,555 260,448 408,327 518,390 636,502 742,372 864,258 976,374 1056,524" />
      <polyline
        className="map-art__farm-road"
        points="168,555 260,448 408,327 518,390 636,502 742,372 864,258 976,374 1056,524"
        style={{ stroke: "url(#farm-map-dirt)" }}
      />
      <polyline className="map-art__road-dash" points="168,555 260,448 408,327 518,390 636,502 742,372 864,258 976,374 1056,524" />

      <rect
        className="map-art__farm-plot"
        x="474"
        y="510"
        width="124"
        height="92"
        style={{ fill: "url(#farm-map-dirt)" }}
      />

      <g className="map-art__mountains">
        <polygon points="24,230 72,166 112,166 160,78 226,230" />
        <polygon points="140,230 210,128 248,128 304,40 382,230" />
        <polygon points="286,230 330,170 364,170 418,106 464,230" />
        <polygon className="map-art__snow" points="242,88 258,44 292,90 274,86 258,106" />
      </g>

      <g className="map-art__clouds">
        <g transform="translate(610 92)">
          <rect x="0" y="28" width="126" height="34" />
          <rect x="22" y="8" width="46" height="54" />
          <rect x="68" y="18" width="54" height="44" />
        </g>
        <g transform="translate(920 126)">
          <rect x="0" y="22" width="112" height="30" />
          <rect x="20" y="0" width="42" height="52" />
          <rect x="62" y="12" width="46" height="40" />
        </g>
      </g>

      <g className="map-art__forest map-art__forest--left">
        {MAP_PIXEL_TREES.map(([x, y, tone]) => (
          <g className={`map-art__tree map-art__tree--${tone}`} transform={`translate(${x} ${y})`} key={`${x}-${y}`}>
            <rect x="-7" y="40" width="14" height="34" />
            <rect x="-27" y="18" width="54" height="24" />
            <rect x="-19" y="-4" width="38" height="24" />
            <rect x="-11" y="-22" width="22" height="22" />
          </g>
        ))}
      </g>

      <g className="map-art__home" transform="translate(92 520)">
        <rect className="map-art__home-shadow" x="6" y="132" width="152" height="18" />
        <polygon className="map-art__roof" points="0,58 24,58 24,34 48,34 48,14 78,14 78,34 104,34 104,58 150,58 150,78 0,78" />
        <rect className="map-art__wall" x="18" y="76" width="114" height="66" />
        <rect className="map-art__door" x="62" y="100" width="30" height="42" />
        <rect className="map-art__window" x="32" y="90" width="22" height="22" />
        <rect className="map-art__window" x="100" y="90" width="22" height="22" />
        <rect className="map-art__chimney" x="116" y="26" width="18" height="28" />
        <rect className="map-art__smoke" x="132" y="-6" width="18" height="12" />
        <rect className="map-art__smoke" x="150" y="-22" width="24" height="12" />
      </g>

      <g className="map-art__playground" transform="translate(326 246)">
        <polygon className="map-art__slide" points="8,104 48,12 92,12 46,104" />
        <polyline className="map-art__swing" points="102,104 132,8 170,104" />
        <line className="map-art__swing" x1="116" y1="48" x2="156" y2="48" />
        <line className="map-art__swing" x1="126" y1="48" x2="126" y2="90" />
        <line className="map-art__swing" x1="148" y1="48" x2="148" y2="90" />
        <rect x="116" y="88" width="14" height="8" />
        <rect x="139" y="88" width="14" height="8" />
        <rect className="map-art__ball" x="62" y="108" width="28" height="28" />
        <rect className="map-art__ball-shine" x="70" y="112" width="8" height="8" />
      </g>

      <g className="map-art__school" transform="translate(554 446)">
        <rect className="map-art__school-shadow" x="8" y="160" width="208" height="18" />
        <polygon className="map-art__roof" points="0,64 32,64 32,44 74,44 74,24 108,24 108,44 150,44 150,64 212,64 212,86 0,86" />
        <rect className="map-art__wall" x="16" y="84" width="180" height="88" />
        <rect className="map-art__door" x="86" y="108" width="38" height="64" />
        <rect className="map-art__window" x="38" y="88" width="30" height="28" />
        <rect className="map-art__window" x="144" y="88" width="30" height="28" />
        <rect x="94" y="-26" width="18" height="42" />
        <polygon className="map-art__flag" points="112,-24 166,-24 152,-6 166,12 112,12" />
      </g>

      <g className="map-art__dream" transform="translate(786 156)">
        <polygon className="map-art__balloon" points="48,0 88,16 104,56 86,98 58,130 38,130 10,98 -6,56 8,16" />
        <line className="map-art__balloon-line" x1="28" y1="96" x2="42" y2="142" />
        <line className="map-art__balloon-line" x1="70" y1="96" x2="56" y2="142" />
        <rect className="map-art__basket" x="40" y="140" width="20" height="18" />
        <polygon className="map-art__stars" points="150,14 160,34 180,34 164,48 170,68 150,58 130,68 136,48 120,34 140,34" />
        <polygon className="map-art__stars" points="196,86 202,98 216,98 206,108 210,122 196,116 184,122 188,108 178,98 190,98" />
      </g>

      <g className="map-art__gate" transform="translate(1000 466)">
        <rect className="map-art__gate-shadow" x="-8" y="144" width="178" height="18" />
        <polygon points="0,150 0,42 18,42 18,24 32,24 32,8 56,32 56,150" />
        <polygon points="106,150 106,32 130,8 130,24 146,24 146,42 162,42 162,150" />
        <polygon points="42,150 42,68 52,52 70,42 92,52 106,68 106,150" />
        <rect className="map-art__gate-door" x="55" y="82" width="38" height="68" />
        <polygon className="map-art__banner" points="58,18 106,18 106,56 82,44 58,56" />
      </g>

      <g className="map-art__bridge" transform="translate(406 424)">
        <polygon points="0,44 18,22 36,12 72,12 90,22 108,44 108,68 0,68" />
        <polyline points="12,44 36,26 72,26 96,44" />
      </g>

      <g className="map-art__details">
        {MAP_PIXEL_FLOWERS.map(([x, y]) => (
          <g className="map-art__flower" transform={`translate(${x} ${y})`} key={`${x}-${y}`}>
            <rect x="-4" y="-12" width="8" height="8" />
            <rect x="-12" y="-4" width="8" height="8" />
            <rect x="4" y="-4" width="8" height="8" />
            <rect x="-4" y="4" width="8" height="8" />
            <rect x="-2" y="-2" width="4" height="4" />
          </g>
        ))}
        <polyline className="map-art__grass-cut" points="242,674 258,650 276,674" />
        <polyline className="map-art__grass-cut" points="820,666 840,638 862,666" />
        <polyline className="map-art__grass-cut" points="1096,684 1112,660 1130,684" />
      </g>
    </svg>
  );
}

export function RoyalPixelCharacter({ initial }: { initial: string }) {
  return (
    <svg className="royal-pixel" viewBox="0 0 64 92" shapeRendering="crispEdges">
      <rect className="royal-pixel__shadow" x="18" y="84" width="30" height="5" />
      <rect className="royal-pixel__shadow royal-pixel__shadow--soft" x="24" y="89" width="18" height="3" />

      <g className="royal-pixel__cape">
        <rect x="12" y="36" width="40" height="42" />
        <rect x="8" y="46" width="8" height="28" />
        <rect x="48" y="46" width="8" height="28" />
      </g>

      <rect className="royal-pixel__leg royal-pixel__leg--left" x="21" y="66" width="9" height="15" />
      <rect className="royal-pixel__leg royal-pixel__leg--right" x="34" y="66" width="9" height="15" />
      <rect className="royal-pixel__boot royal-pixel__boot--left" x="16" y="78" width="14" height="6" />
      <rect className="royal-pixel__boot royal-pixel__boot--right" x="34" y="78" width="14" height="6" />

      <g className="royal-pixel__robe">
        <rect className="royal-pixel__arm royal-pixel__arm--left" x="8" y="40" width="10" height="22" />
        <rect className="royal-pixel__arm royal-pixel__arm--right" x="46" y="40" width="10" height="22" />
        <rect className="royal-pixel__body" x="18" y="34" width="28" height="38" />
        <rect className="royal-pixel__trim" x="28" y="38" width="8" height="31" />
        <rect className="royal-pixel__trim" x="22" y="42" width="4" height="22" />
        <rect className="royal-pixel__trim" x="38" y="42" width="4" height="22" />
        <rect className="royal-pixel__hand royal-pixel__hand--left" x="8" y="60" width="10" height="8" />
        <rect className="royal-pixel__hand royal-pixel__hand--right" x="46" y="60" width="10" height="8" />
      </g>

      <g className="royal-pixel__head">
        <rect className="royal-pixel__hair" x="18" y="15" width="28" height="24" />
        <rect className="royal-pixel__face" x="20" y="20" width="24" height="22" />
        <rect className="royal-pixel__ear" x="16" y="28" width="4" height="8" />
        <rect className="royal-pixel__ear" x="44" y="28" width="4" height="8" />
        <rect className="royal-pixel__eye" x="26" y="29" width="4" height="4" />
        <rect className="royal-pixel__eye" x="36" y="29" width="4" height="4" />
        <rect className="royal-pixel__blush" x="22" y="36" width="4" height="3" />
        <rect className="royal-pixel__blush" x="40" y="36" width="4" height="3" />
      </g>

      <g className="royal-pixel__crown royal-pixel__crown--royal">
        <rect x="18" y="10" width="28" height="8" />
        <rect x="20" y="4" width="6" height="8" />
        <rect x="30" y="0" width="6" height="10" />
        <rect x="40" y="4" width="6" height="8" />
      </g>

      <g className="royal-pixel__emperor-hat">
        <rect x="18" y="2" width="28" height="6" />
        <rect x="12" y="8" width="40" height="8" />
        <rect x="6" y="16" width="52" height="8" />
        <rect x="20" y="24" width="24" height="6" />
      </g>

      <g className="royal-pixel__helmet">
        <rect x="16" y="8" width="32" height="14" />
        <rect x="12" y="20" width="40" height="12" />
        <rect x="22" y="28" width="20" height="8" />
        <rect x="30" y="8" width="4" height="28" />
      </g>

      <g className="royal-pixel__shield">
        <rect x="48" y="48" width="12" height="24" />
        <rect x="52" y="72" width="4" height="6" />
        <rect x="52" y="54" width="4" height="12" />
      </g>

      <g className="royal-pixel__scepter">
        <rect x="53" y="30" width="4" height="36" />
        <rect x="49" y="26" width="12" height="6" />
        <rect x="53" y="20" width="4" height="8" />
      </g>

      <text className="royal-pixel__initial" x="32" y="59" textAnchor="middle">{initial}</text>
      <g className="royal-pixel__spark">
        <rect x="2" y="24" width="4" height="4" />
        <rect x="6" y="28" width="4" height="4" />
        <rect x="2" y="32" width="4" height="4" />
        <rect x="54" y="8" width="4" height="4" />
        <rect x="58" y="12" width="4" height="4" />
      </g>
    </svg>
  );
}
