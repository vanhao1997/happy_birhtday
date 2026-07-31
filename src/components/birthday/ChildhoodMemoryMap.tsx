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
import { Check, Gift, Loader2, LockKeyhole, MapPin, RotateCcw } from "lucide-react";
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
  const [questState, dispatchQuest] = useReducer(
    pixelQuestReducer,
    undefined,
    () => createPixelQuestState(journeyId, pixelQuest),
  );
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const mapRef = useRef<HTMLDivElement | null>(null);
  const stationRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const progressStorageKey = `happybirthday.memoryMap.${journeyId}`;
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
  const stationX = mapSize.width * (activeZone?.mapXPercent ?? 14) / 100;
  const characterOffset = mapSize.width > 0
    ? Math.min(78, Math.max(56, mapSize.width * 0.085))
    : 0;
  const characterDirection = activeIndex < 3 ? 1 : -1;
  const characterEdge = mapSize.width < 400 ? 36 : 48;
  const characterX = mapSize.width > 0
    ? Math.min(
        mapSize.width - characterEdge,
        Math.max(characterEdge, stationX + characterOffset * characterDirection),
      )
    : 0;
  const characterY = mapSize.height * (activeZone?.mapYPercent ?? 73) / 100;

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
    const map = mapRef.current;
    if (!map) return;

    const updateSize = () => {
      const bounds = map.getBoundingClientRect();
      setMapSize({ width: bounds.width, height: bounds.height });
    };

    updateSize();
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateSize);
    observer.observe(map);
    return () => observer.disconnect();
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

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).tagName === "BUTTON") return;

    let nextIndex = activeIndex;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = Math.max(0, activeIndex - 1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = Math.min(maximumIndex, activeIndex + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = maximumIndex;
    } else {
      return;
    }

    event.preventDefault();
    selectStation(nextIndex, false);
    stationRefs.current[nextIndex]?.focus({ preventScroll: true });
  }

  const mapStyle = {
    "--map-ratio": `${pixelQuest.mapWidthPx} / ${pixelQuest.mapHeightPx}`,
  } as CSSProperties;
  const characterStyle = {
    "--character-x": `${characterX}px`,
    "--character-y": `${characterY}px`,
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
        aria-label={`Bản đồ ký ức của ${recipientName}. Dùng Tab để chọn trạm hoặc phím mũi tên để di chuyển giữa các trạm đã mở.`}
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
              data-visited={visited}
              data-enabled={enabled}
              key={zone.id}
              aria-label={`${visited ? "Xem lại" : enabled ? "Khám phá" : "Chưa mở"} trạm ${index + 1}: ${zone.title}`}
              aria-pressed={active}
              aria-busy={active && activeLoading}
              disabled={!enabled || status === "loading"}
              onClick={() => selectStation(index, true)}
            >
              <span className="childhood-map__station-marker" aria-hidden="true">
                {visited ? <Check size={18} /> : index === 4 ? <Gift size={18} /> : <MapPin size={18} />}
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
          data-ready={mapSize.width > 0}
          aria-hidden="true"
        >
          <RoyalPixelCharacter
            initial={initialsFromName(recipientName).slice(0, 1)}
          />
        </div>

        <div className="childhood-map__hud" aria-hidden="true">
          <span>MAP 08</span>
          <span>MEM {Math.min(completedChapterCount, 4)}/4</span>
          <span>{voucherRevealed ? "GIFT OPEN" : "NO FAIL"}</span>
        </div>
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

function MapArtwork() {
  return (
    <svg
      className="childhood-map__art"
      viewBox="0 0 1200 760"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect className="map-art__grass" width="1200" height="760" />
      <path className="map-art__meadow map-art__meadow--one" d="M0 450C160 390 278 420 390 520S640 674 805 590 1040 430 1200 492V760H0Z" />
      <path className="map-art__meadow map-art__meadow--two" d="M0 0H1200V182C1034 142 936 214 796 180S502 88 334 174 112 276 0 230Z" />
      <path className="map-art__river" d="M448-20C426 116 548 182 516 308S370 466 424 596 596 706 610 800" />
      <path className="map-art__river-shine" d="M463-20C442 114 563 184 531 312S388 470 442 594 612 704 626 800" />
      <path className="map-art__road-shadow" d="M160 590C224 474 328 346 438 340S600 548 718 422 882 302 1048 564" />
      <path className="map-art__road" d="M160 590C224 474 328 346 438 340S600 548 718 422 882 302 1048 564" />
      <path className="map-art__road-dash" d="M160 590C224 474 328 346 438 340S600 548 718 422 882 302 1048 564" />

      <g className="map-art__mountains">
        <path d="M20 230 128 72 236 230Z" />
        <path d="M132 230 258 38 382 230Z" />
        <path d="M272 230 356 106 452 230Z" />
        <path className="map-art__snow" d="m226 88 32-50 34 52-18-7-17 18-15-18Z" />
      </g>

      <g className="map-art__clouds">
        <path d="M618 92c18-34 72-29 82 8 42-12 70 46 31 68H612c-42-18-34-70 6-76Z" />
        <path d="M930 122c16-30 62-24 72 8 38-10 61 42 26 61H918c-36-18-25-61 12-69Z" />
      </g>

      <g className="map-art__forest map-art__forest--left">
        {[[72, 330], [116, 360], [168, 318], [220, 356], [264, 302]].map(([x, y]) => (
          <g transform={`translate(${x} ${y})`} key={`${x}-${y}`}>
            <rect x="-7" y="34" width="14" height="28" />
            <path d="M0-12-34 42h68Z" />
            <path d="M0 8-30 54h60Z" />
          </g>
        ))}
      </g>
      <g className="map-art__forest map-art__forest--right">
        {[[884, 494], [930, 454], [974, 488], [1110, 350], [1150, 392]].map(([x, y]) => (
          <g transform={`translate(${x} ${y})`} key={`${x}-${y}`}>
            <rect x="-7" y="34" width="14" height="28" />
            <path d="M0-12-34 42h68Z" />
            <path d="M0 8-30 54h60Z" />
          </g>
        ))}
      </g>

      <g className="map-art__home" transform="translate(92 520)">
        <path d="M0 58 72 0l76 58Z" />
        <rect x="18" y="54" width="114" height="88" />
        <rect className="map-art__door" x="62" y="88" width="30" height="54" />
        <rect className="map-art__window" x="30" y="76" width="24" height="25" />
        <rect className="map-art__window" x="101" y="76" width="20" height="25" />
        <path className="map-art__smoke" d="M120 16c22-20-8-30 14-51" />
      </g>

      <g className="map-art__playground" transform="translate(326 246)">
        <path className="map-art__slide" d="M0 102 40 10h44L34 102Z" />
        <path className="map-art__swing" d="M96 104 128 8l38 96M112 48h40M122 48v42M145 48v42" />
        <rect x="116" y="88" width="14" height="8" />
        <rect x="139" y="88" width="14" height="8" />
        <circle className="map-art__ball" cx="72" cy="116" r="18" />
      </g>

      <g className="map-art__school" transform="translate(554 446)">
        <path d="M0 64 104 4l108 60Z" />
        <rect x="16" y="60" width="180" height="112" />
        <rect className="map-art__door" x="86" y="108" width="38" height="64" />
        <rect className="map-art__window" x="38" y="88" width="30" height="28" />
        <rect className="map-art__window" x="144" y="88" width="30" height="28" />
        <rect x="94" y="-26" width="18" height="42" />
        <path className="map-art__flag" d="M112-24h54l-14 18 14 18h-54Z" />
      </g>

      <g className="map-art__dream" transform="translate(786 156)">
        <path className="map-art__balloon" d="M48 0c54 0 74 58 28 108L56 130 34 108C-12 58-6 0 48 0Z" />
        <path className="map-art__balloon-line" d="M28 96 42 142M70 96 56 142" />
        <rect className="map-art__basket" x="40" y="140" width="20" height="18" />
        <path className="map-art__stars" d="m142 14 8 16 18 3-13 13 3 18-16-8-16 8 3-18-13-13 18-3ZM194 86l5 10 12 2-9 8 2 12-10-6-10 6 2-12-9-8 12-2Z" />
      </g>

      <g className="map-art__gate" transform="translate(1000 466)">
        <path d="M0 150V36L28 8l28 28v114ZM106 150V36l28-28 28 28v114Z" />
        <path d="M42 150V68c0-36 64-36 64 0v82Z" />
        <rect className="map-art__gate-door" x="55" y="82" width="38" height="68" />
        <path className="map-art__banner" d="M58 18h48v38L82 44 58 56Z" />
      </g>

      <g className="map-art__bridge" transform="translate(406 424)">
        <path d="M0 40Q54-10 108 40v28H0Z" />
        <path d="M10 42Q54 7 98 42" />
      </g>

      <g className="map-art__details">
        <circle cx="292" cy="592" r="8" />
        <circle cx="314" cy="614" r="5" />
        <circle cx="752" cy="598" r="7" />
        <circle cx="782" cy="618" r="5" />
        <path d="M242 674q18-28 36 0M820 666q20-32 42 0M1096 684q17-27 34 0" />
      </g>
    </svg>
  );
}

function RoyalPixelCharacter({ initial }: { initial: string }) {
  return (
    <svg className="royal-pixel" viewBox="0 0 96 132" shapeRendering="crispEdges">
      <ellipse className="royal-pixel__shadow" cx="48" cy="124" rx="31" ry="7" />
      <path className="royal-pixel__cape" d="M20 56h56l12 62H8Z" />
      <rect className="royal-pixel__leg" x="27" y="96" width="17" height="22" />
      <rect className="royal-pixel__leg" x="52" y="96" width="17" height="22" />
      <rect className="royal-pixel__boot" x="20" y="114" width="27" height="10" />
      <rect className="royal-pixel__boot" x="49" y="114" width="27" height="10" />
      <path className="royal-pixel__body" d="M24 54h48l8 48H16Z" />
      <rect className="royal-pixel__arm" x="8" y="62" width="16" height="35" />
      <rect className="royal-pixel__arm" x="72" y="62" width="16" height="35" />
      <rect className="royal-pixel__hand" x="9" y="93" width="14" height="12" />
      <rect className="royal-pixel__hand" x="73" y="93" width="14" height="12" />
      <rect className="royal-pixel__face" x="25" y="24" width="46" height="38" />
      <path className="royal-pixel__hair" d="M20 48V18h12V8h32v8h12v36H66V30H30v18Z" />
      <rect className="royal-pixel__eye" x="34" y="38" width="6" height="6" />
      <rect className="royal-pixel__eye" x="56" y="38" width="6" height="6" />
      <path className="royal-pixel__crown royal-pixel__crown--royal" d="M23 24V5l12 9L48 0l13 14 12-9v19Z" />
      <path className="royal-pixel__helmet" d="M18 38V12h60v26H64V26H32v12Z" />
      <path className="royal-pixel__shield" d="M70 72h24v30c0 14-12 22-12 22s-12-8-12-22Z" />
      <path className="royal-pixel__scepter" d="M84 48h5v50h-5ZM78 42h17v10H78Z" />
      <text className="royal-pixel__initial" x="48" y="88" textAnchor="middle">{initial}</text>
      <path className="royal-pixel__spark" d="m4 32 4 8 8 4-8 4-4 8-4-8-8-4 8-4ZM88 14l3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" />
    </svg>
  );
}
