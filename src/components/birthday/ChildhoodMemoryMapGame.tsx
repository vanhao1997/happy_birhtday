"use client";

/* Local resume and camera follow intentionally synchronize React state from effects. */
/* eslint-disable react-hooks/set-state-in-effect */

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { Check, CircleHelp, Compass, Loader2, LockKeyhole, MapPin, Pause, Play, RotateCcw, Sparkles, Volume2, VolumeX, X } from "lucide-react";
import { DEFAULT_PIXEL_QUEST, publicPixelQuest } from "@/lib/birthday/dto";
import type {
  PixelCharacterArchetype,
  PixelQuestEventName,
  PublicChildCharacterDTO,
  PublicMemoryImageDTO,
  PublicPixelQuestConfigDTO,
  PublicPixelQuestZoneDTO,
} from "@/lib/birthday/types";
import type { ApiStatus } from "./types";
import { initialsFromName } from "./content";
import { FarmMapDecor, FarmPixelCharacter } from "./FarmPixelAssets";
import { NpcDialoguePanel, QuestTarget, QuestTracker } from "./StoryRpgUI";
import {
  createPixelQuestState,
  isMemoryStationEnabled,
  isMemoryStationVisited,
  pixelQuestProgress,
  pixelQuestReducer,
} from "./pixel-quest";
import { MapArtwork, RoyalPixelCharacter } from "./ChildhoodMemoryMap";
import {
  calculateCameraWithDeadZone,
  directionToward,
  findWaypointPath,
  isGamePoint,
  isBlocked,
  latestHeldDirection,
  MEMORY_CAMERA_ZOOM,
  MEMORY_WORLD,
  movePlayer,
  moveTowardWithCollision,
  nearestZoneIndex,
  phaseForState,
  pixelQuestConfigSignature,
  playerStartPoint,
  questForZone,
  type GameDirection,
  type GamePoint,
  type MemoryWorldMetrics,
  type Waypoint,
  waypointForZone,
  worldMetrics,
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
  ) => Promise<boolean> | boolean;
  onGameEvent?: (
    eventName: PixelQuestEventName,
    checkpointId: string | null,
    moveCount: number,
  ) => void;
};

type PersistedWorldState = {
  version: 3;
  journeyId: string;
  configSignature: string;
  world: {
    width: number;
    height: number;
    cameraZoom: number;
  };
  position: GamePoint;
  direction: GameDirection;
  tutorialSeen: boolean;
  activeQuestNodeId?: string | null;
};

const WORLD_STATE_VERSION = 3 as const;
const QUEST_TARGET_OFFSETS: GamePoint[] = [
  { x: 104, y: -28 },
  { x: -92, y: 56 },
  { x: 116, y: 44 },
  { x: -112, y: -46 },
  { x: 92, y: 30 },
];

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
  const world = candidate.world;
  return candidate.version === WORLD_STATE_VERSION
    && typeof candidate.journeyId === "string"
    && typeof candidate.configSignature === "string"
    && Boolean(world)
    && typeof world === "object"
    && !Array.isArray(world)
    && typeof (world as Record<string, unknown>).width === "number"
    && typeof (world as Record<string, unknown>).height === "number"
    && typeof (world as Record<string, unknown>).cameraZoom === "number"
    && isGamePoint(candidate.position)
    && typeof candidate.direction === "string"
    && DIRECTIONS.includes(candidate.direction as GameDirection)
    && typeof candidate.tutorialSeen === "boolean"
    && (candidate.activeQuestNodeId === undefined
      || candidate.activeQuestNodeId === null
      || typeof candidate.activeQuestNodeId === "string");
}

function clampWorldPoint(point: GamePoint, world: MemoryWorldMetrics = MEMORY_WORLD): GamePoint {
  return {
    x: Math.min(world.width - world.playerRadius, Math.max(world.playerRadius, point.x)),
    y: Math.min(world.height - world.playerRadius, Math.max(world.playerRadius, point.y)),
  };
}

export function ChildhoodMemoryMapGame({
  images,
  pixelQuest: receivedPixelQuest = DEFAULT_PIXEL_QUEST,
  recipientName,
  childCharacter,
  accent,
  sessionId,
  completedChapterCount,
  voucherRevealed,
  status,
  errorMessage = "",
  onOpenStation,
  onGameEvent,
}: ChildhoodMemoryMapProps) {
  // Resume data can outlive the DTO version stored by an older deployment.
  const pixelQuest = useMemo(
    () => publicPixelQuest(receivedPixelQuest),
    [receivedPixelQuest],
  );
  const frames = Array.from({ length: 5 }, (_, index) => images[index] ?? null);
  const journeyId = sessionId || `local-${recipientName}`;
  const gameWorld = useMemo(() => worldMetrics(pixelQuest.world), [pixelQuest.world]);
  const configSignature = useMemo(() => pixelQuestConfigSignature(pixelQuest), [pixelQuest]);
  const progressStorageKey = `happybirthday.memoryMap.${journeyId}`;
  const worldStorageKey = `happybirthday.memoryMapWorld.v3.${journeyId}`;
  const firstZone = pixelQuest.zones[0] ?? DEFAULT_PIXEL_QUEST.zones[0]!;
  const [questState, dispatchQuest] = useState(() => createPixelQuestState(journeyId, pixelQuest));
  const [playerPosition, setPlayerPosition] = useState<GamePoint>(() => (
    clampWorldPoint(pixelQuest.world.spawnPoint, worldMetrics(pixelQuest.world))
  ));
  const [playerDirection, setPlayerDirection] = useState<GameDirection>("down");
  const [playerMoving, setPlayerMoving] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<GamePoint>({ x: 0, y: 0 });
  const [hydratedWorldIdentity, setHydratedWorldIdentity] = useState<string | null>(null);
  const [tutorialOpen, setTutorialOpen] = useState(true);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [dialogueIndex, setDialogueIndex] = useState<number | null>(null);
  const [activeQuestIndex, setActiveQuestIndex] = useState<number | null>(null);
  const [sceneIndex, setSceneIndex] = useState<number | null>(null);
  const [waypointPath, setWaypointPath] = useState<Waypoint[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [discoveryMessage, setDiscoveryMessage] = useState("");
  const mapRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const characterRef = useRef<HTMLDivElement | null>(null);
  const miniMapPlayerRef = useRef<HTMLSpanElement | null>(null);
  const waypointLineRef = useRef<HTMLSpanElement | null>(null);
  const sceneCloseRef = useRef<HTMLButtonElement | null>(null);
  const heldDirectionsRef = useRef<Set<GameDirection>>(new Set());
  const activeDirectionRef = useRef<GameDirection>("down");
  const playerMovingRef = useRef(false);
  const playerPositionRef = useRef(playerPosition);
  const cameraRef = useRef(camera);
  const moveCountRef = useRef(0);
  const previousNearbyRef = useRef(-2);
  const discoveryTimeoutRef = useRef<number | null>(null);
  const worldLoadedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  const questReducerDispatch = (action: Parameters<typeof pixelQuestReducer>[1]) => {
    dispatchQuest((current) => pixelQuestReducer(current, action));
  };

  const activeIndex = Math.max(0, pixelQuest.zones.findIndex((zone) => zone.id === questState.activeCheckpointId));
  const activeZone = pixelQuest.zones[activeIndex] ?? firstZone;
  const activeImage = frames[activeIndex];
  const activeVisited = isMemoryStationVisited(activeIndex, completedChapterCount, voucherRevealed);
  const nearbyIndex = nearestZoneIndex(
    playerPosition,
    pixelQuest.zones,
    gameWorld.stationRadius,
    gameWorld,
  );
  const nearbyZone = nearbyIndex >= 0 ? pixelQuest.zones[nearbyIndex] : null;
  const nearbyEnabled = nearbyIndex >= 0 && isMemoryStationEnabled(nearbyIndex, completedChapterCount, pixelQuest.zones.length);
  const visitedCount = pixelQuest.zones.filter((_, index) => isMemoryStationVisited(index, completedChapterCount, voucherRevealed)).length;
  const nextObjectiveIndex = Math.min(completedChapterCount, pixelQuest.zones.length - 1);
  const objectiveZone = pixelQuest.zones[nextObjectiveIndex] ?? firstZone;
  const dialogueZone = dialogueIndex === null ? null : pixelQuest.zones[dialogueIndex] ?? null;
  const dialogueQuest = dialogueZone ? questForZone(dialogueZone, pixelQuest.quests) : null;
  const dialogueNpc = dialogueZone
    ? pixelQuest.npcs.find((npc) => npc.nodeId === dialogueZone.id) ?? null
    : null;
  const activeQuestZone = activeQuestIndex === null ? null : pixelQuest.zones[activeQuestIndex] ?? null;
  const activeQuest = activeQuestZone ? questForZone(activeQuestZone, pixelQuest.quests) : null;
  const activeQuestTarget = activeQuestZone
    ? (() => {
        const station = zoneToWorldPoint(activeQuestZone, gameWorld);
        const offset = QUEST_TARGET_OFFSETS[activeQuestIndex ?? 0] ?? { x: 84, y: 24 };
        return clampWorldPoint({ x: station.x + offset.x, y: station.y + offset.y }, gameWorld);
      })()
    : null;
  const questTargetNearby = activeQuestTarget
    ? Math.hypot(playerPosition.x - activeQuestTarget.x, playerPosition.y - activeQuestTarget.y) <= 92
    : false;
  const interactionReady = activeQuestIndex !== null ? questTargetNearby : nearbyEnabled;
  const gamePhase = phaseForState({
    hydrated: questState.hydrated,
    tutorialOpen,
    pauseOpen,
    dialogueOpen: dialogueIndex !== null,
    questActive: activeQuestIndex !== null,
    sceneOpen: sceneIndex !== null,
    completed: voucherRevealed,
    error: status === "error",
  });
  const cameraZoom = pixelQuest.world.cameraZoom ?? MEMORY_CAMERA_ZOOM;
  const worldStateIdentity = `${worldStorageKey}:${configSignature}:${gameWorld.width}x${gameWorld.height}@${cameraZoom}`;
  const waypoint = waypointPath[0] ?? null;
  const worldStyle = {
    width: `${gameWorld.width}px`,
    height: `${gameWorld.height}px`,
    transform: `translate3d(-${camera.x * cameraZoom}px, -${camera.y * cameraZoom}px, 0) scale(${cameraZoom})`,
  } as CSSProperties;

  useEffect(() => {
    setCamera((previous) => {
      const next = calculateCameraWithDeadZone(
      playerPosition,
      viewport,
      previous,
      cameraZoom,
      gameWorld,
      );
      cameraRef.current = next;
      return next;
    });
  }, [cameraZoom, gameWorld, playerPosition, viewport]);

  useEffect(() => {
    if (hydratedWorldIdentity === worldStateIdentity) return;

    const raw = window.localStorage.getItem(worldStorageKey);
    let restored: PersistedWorldState | null = null;
    try {
      const candidate = raw ? JSON.parse(raw) as unknown : null;
      if (
        isPersistedWorldState(candidate)
        && candidate.journeyId === journeyId
        && candidate.configSignature === configSignature
        && candidate.world.width === gameWorld.width
        && candidate.world.height === gameWorld.height
        && candidate.world.cameraZoom === cameraZoom
      ) restored = candidate;
    } catch {
      window.localStorage.removeItem(worldStorageKey);
    }

    if (restored) {
      setPlayerPosition(clampWorldPoint(restored.position, gameWorld));
      setPlayerDirection(restored.direction);
      activeDirectionRef.current = restored.direction;
      setTutorialOpen(!restored.tutorialSeen);
      if (restored.activeQuestNodeId) {
        const restoredQuestIndex = pixelQuest.zones.findIndex(
          (zone) => zone.id === restored.activeQuestNodeId,
        );
        if (
          restoredQuestIndex >= 0
          && isMemoryStationEnabled(restoredQuestIndex, completedChapterCount, pixelQuest.zones.length)
          && !isMemoryStationVisited(restoredQuestIndex, completedChapterCount, voucherRevealed)
        ) {
          setActiveQuestIndex(restoredQuestIndex);
          questReducerDispatch({
            type: "select",
            checkpointId: restored.activeQuestNodeId,
            completedChapterCount,
            config: pixelQuest,
          });
        }
      }
    } else if (raw) {
      window.localStorage.removeItem(worldStorageKey);
    }

    setHydratedWorldIdentity(worldStateIdentity);
  }, [cameraZoom, completedChapterCount, configSignature, gameWorld, hydratedWorldIdentity, journeyId, pixelQuest, voucherRevealed, worldStateIdentity, worldStorageKey]);

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
    if (!questState.hydrated || worldLoadedRef.current) return;
    worldLoadedRef.current = true;
    onGameEvent?.("world_loaded", null, moveCountRef.current);
  }, [onGameEvent, questState.hydrated]);

  useEffect(() => {
    window.localStorage.setItem(progressStorageKey, JSON.stringify(pixelQuestProgress(questState)));
  }, [progressStorageKey, questState]);

  useEffect(() => {
    if (hydratedWorldIdentity !== worldStateIdentity) return;

    const state: PersistedWorldState = {
      version: WORLD_STATE_VERSION,
      journeyId,
      configSignature,
      world: {
        width: gameWorld.width,
        height: gameWorld.height,
        cameraZoom,
      },
      position: playerPosition,
      direction: playerDirection,
      tutorialSeen: !tutorialOpen,
      activeQuestNodeId: activeQuestZone?.id ?? null,
    };
    window.localStorage.setItem(worldStorageKey, JSON.stringify(state));
  }, [activeQuestZone?.id, cameraZoom, configSignature, gameWorld.height, gameWorld.width, hydratedWorldIdentity, journeyId, playerDirection, playerPosition, tutorialOpen, worldStateIdentity, worldStorageKey]);

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
      playerMovingRef.current = false;
      setPlayerMoving(false);
      setPlayerPosition({ ...playerPositionRef.current });
      setCamera({ ...cameraRef.current });
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
    const previousNearby = previousNearbyRef.current;
    if (nearbyIndex >= 0 && nearbyIndex !== previousNearby && nearbyZone) {
      setDiscoveryMessage(
        nearbyEnabled
          ? `${nearbyZone.title} · nhấn Enter để mở`
          : `${nearbyZone.title} · trạm đang khóa`,
      );
      if (discoveryTimeoutRef.current !== null) {
        window.clearTimeout(discoveryTimeoutRef.current);
      }
      discoveryTimeoutRef.current = window.setTimeout(() => {
        setDiscoveryMessage("");
        discoveryTimeoutRef.current = null;
      }, 2600);
      onGameEvent?.("checkpoint_reached", nearbyZone.id, moveCountRef.current);
    }
    previousNearbyRef.current = nearbyIndex;
  }, [nearbyEnabled, nearbyIndex, nearbyZone, onGameEvent]);

  useEffect(() => () => {
    if (discoveryTimeoutRef.current !== null) {
      window.clearTimeout(discoveryTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let frame = 0;
    let previous = performance.now();
    let waypointTransitionPending = false;
    const updateMoving = (moving: boolean) => {
      if (playerMovingRef.current === moving) return;
      playerMovingRef.current = moving;
      setPlayerMoving(moving);
    };
    const applyVisualFrame = (point: GamePoint) => {
      const character = characterRef.current;
      if (character) {
        character.style.left = `${point.x}px`;
        character.style.top = `${point.y}px`;
        character.style.setProperty("--character-x", `${(point.x / gameWorld.width) * 100}%`);
        character.style.setProperty("--character-y", `${(point.y / gameWorld.height) * 100}%`);
      }
      const miniMapPlayer = miniMapPlayerRef.current;
      if (miniMapPlayer) {
        miniMapPlayer.style.left = `${(point.x / gameWorld.width) * 100}%`;
        miniMapPlayer.style.top = `${(point.y / gameWorld.height) * 100}%`;
      }
      const nextCamera = calculateCameraWithDeadZone(
        point,
        viewport,
        cameraRef.current,
        cameraZoom,
        gameWorld,
      );
      cameraRef.current = nextCamera;
      if (worldRef.current) {
        worldRef.current.style.transform = `translate3d(-${nextCamera.x * cameraZoom}px, -${nextCamera.y * cameraZoom}px, 0) scale(${cameraZoom})`;
      }
      if (mapRef.current) {
        mapRef.current.dataset.cameraX = String(Math.round(nextCamera.x));
        mapRef.current.dataset.cameraY = String(Math.round(nextCamera.y));
      }
      if (waypoint && waypointLineRef.current) {
        waypointLineRef.current.style.left = `${point.x}px`;
        waypointLineRef.current.style.top = `${point.y}px`;
        waypointLineRef.current.style.width = `${Math.hypot(waypoint.x - point.x, waypoint.y - point.y)}px`;
        waypointLineRef.current.style.transform = `rotate(${Math.atan2(waypoint.y - point.y, waypoint.x - point.x)}rad)`;
      }
    };
    const tick = (now: number) => {
      const deltaSeconds = Math.min(0.05, (now - previous) / 1000);
      previous = now;
      const movementAllowed = !pauseOpen
        && !tutorialOpen
        && dialogueIndex === null
        && sceneIndex === null;
      if (movementAllowed && heldDirectionsRef.current.size > 0) {
        if (waypoint && !waypointTransitionPending) {
          waypointTransitionPending = true;
          setWaypointPath([]);
        }
        const direction = latestHeldDirection(heldDirectionsRef.current, activeDirectionRef.current);
        if (activeDirectionRef.current !== direction) {
          activeDirectionRef.current = direction;
          setPlayerDirection(direction);
        }
        const next = movePlayer(playerPositionRef.current, direction, gameWorld.speed * deltaSeconds);
        if (next.x !== playerPositionRef.current.x || next.y !== playerPositionRef.current.y) {
          playerPositionRef.current = next;
          applyVisualFrame(next);
        }
        updateMoving(true);
      } else if (movementAllowed && waypoint) {
        const distanceToTarget = Math.hypot(
          waypoint.x - playerPositionRef.current.x,
          waypoint.y - playerPositionRef.current.y,
        );
        if (distanceToTarget <= 10) {
          if (!waypointTransitionPending) {
            waypointTransitionPending = true;
            playerPositionRef.current = waypoint;
            applyVisualFrame(waypoint);
            setPlayerPosition(waypoint);
            setCamera(cameraRef.current);
            setWaypointPath((current) => current.slice(1));
          }
          updateMoving(false);
        } else {
          const direction = directionToward(playerPositionRef.current, waypoint);
          const next = moveTowardWithCollision(
            playerPositionRef.current,
            waypoint,
            gameWorld.speed * deltaSeconds,
          );
          if (activeDirectionRef.current !== direction) {
            activeDirectionRef.current = direction;
            setPlayerDirection(direction);
          }
          if (next.x === playerPositionRef.current.x && next.y === playerPositionRef.current.y) {
            if (!waypointTransitionPending) {
              waypointTransitionPending = true;
              setWaypointPath([]);
            }
            updateMoving(false);
          } else {
            playerPositionRef.current = next;
            applyVisualFrame(next);
            updateMoving(true);
          }
        }
      } else {
        updateMoving(false);
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [cameraZoom, dialogueIndex, gameWorld, pauseOpen, sceneIndex, tutorialOpen, viewport, waypoint]);

  useEffect(() => {
    playerPositionRef.current = playerPosition;
  }, [playerPosition]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    if (sceneIndex !== null) sceneCloseRef.current?.focus();
  }, [sceneIndex]);

  function dismissTutorial() {
    if (!tutorialOpen) return;
    setTutorialOpen(false);
    onGameEvent?.("intro_dismissed", null, moveCountRef.current);
    mapRef.current?.focus({ preventScroll: true });
  }

  function setPaused(nextPaused: boolean) {
    setPlayerPosition({ ...playerPositionRef.current });
    setCamera({ ...cameraRef.current });
    setPauseOpen(nextPaused);
    onGameEvent?.(nextPaused ? "pause" : "resume", null, moveCountRef.current);
  }

  function setHeldDirection(direction: GameDirection, held: boolean) {
    if (held) {
      activeDirectionRef.current = direction;
      setPlayerDirection(direction);
      heldDirectionsRef.current.add(direction);
    } else {
      heldDirectionsRef.current.delete(direction);
      if (heldDirectionsRef.current.size > 0) {
        const nextDirection = latestHeldDirection(heldDirectionsRef.current, activeDirectionRef.current);
        activeDirectionRef.current = nextDirection;
        setPlayerDirection(nextDirection);
      } else {
        setPlayerPosition({ ...playerPositionRef.current });
        setCamera({ ...cameraRef.current });
      }
    }
  }

  function playGameTone(frequency: number) {
    if (!audioEnabled || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    audioContextRef.current ??= new AudioContextClass();
    const context = audioContextRef.current;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.setValueAtTime(0.035, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  }

  function selectStation(index: number) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)) return;
    const nextMoveCount = moveCountRef.current + (zone.id === questState.activeCheckpointId ? 0 : 1);
    moveCountRef.current = nextMoveCount;
    questReducerDispatch({ type: "select", checkpointId: zone.id, completedChapterCount, config: pixelQuest });
    setDiscoveryMessage("");
  }

  function routeTo(target: GamePoint, source: Waypoint["source"]) {
    const path = findWaypointPath(playerPositionRef.current, target, gameWorld)
      .map((point) => ({ ...point, source }));
    setWaypointPath(path);
    return path.length > 0;
  }

  function travelToStation(index: number) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)) return;
    selectStation(index);
    const hasRoute = routeTo(waypointForZone(zone, gameWorld), "objective");
    setDialogueIndex(null);
    setDiscoveryMessage(
      hasRoute
        ? `Đang đi tới ${zone.title}`
        : "Chưa tìm thấy lối đi an toàn. Hãy thử chọn một điểm gần trạm hơn.",
    );
    playGameTone(240 + index * 34);
  }

  function beginStationInteraction(index: number) {
    const zone = pixelQuest.zones[index];
    if (!zone || !isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)) return;
    selectStation(index);
    setWaypointPath([]);
    if (isMemoryStationVisited(index, completedChapterCount, voucherRevealed)) {
      setSceneIndex(index);
      setDialogueIndex(null);
      return;
    }
    setDialogueIndex(index);
    setPauseOpen(false);
    onGameEvent?.("npc_dialog_opened", zone.id, moveCountRef.current);
    playGameTone(360 + index * 28);
  }

  function beginQuest(index: number) {
    setDialogueIndex(null);
    setActiveQuestIndex(index);
    const zone = pixelQuest.zones[index];
    if (zone) {
      onGameEvent?.("quest_started", zone.id, moveCountRef.current);
      selectStation(index);
      const station = zoneToWorldPoint(zone, gameWorld);
      const offset = QUEST_TARGET_OFFSETS[index] ?? { x: 84, y: 24 };
      routeTo(
        clampWorldPoint({ x: station.x + offset.x, y: station.y + offset.y }, gameWorld),
        "objective",
      );
    }
  }

  async function completeActiveQuest() {
    if (
      activeQuestIndex === null
      || !activeQuestZone
      || !activeQuest
      || !questTargetNearby
      || status === "loading"
    ) return;

    setWaypointPath([]);
    const moveCount = moveCountRef.current;
    const accepted = await onOpenStation(activeQuestIndex, activeQuestZone, moveCount);
    if (!accepted) return;
    setActiveQuestIndex(null);
    setSceneIndex(activeQuestIndex);
    setDiscoveryMessage(activeQuest.completionLine);
    onGameEvent?.("memory_revealed", activeQuestZone.id, moveCountRef.current);
    playGameTone(620 + activeQuestIndex * 24);
  }

  function interactWithNearbyStation() {
    if (status === "loading") return;
    if (activeQuestIndex !== null && questTargetNearby) {
      void completeActiveQuest();
      return;
    }
    if (nearbyIndex < 0 || !nearbyEnabled) return;
    beginStationInteraction(nearbyIndex);
  }

  function resetToActiveStation() {
    const target = playerStartPoint(activeZone, gameWorld);
    playerPositionRef.current = target;
    setPlayerPosition(target);
    activeDirectionRef.current = "down";
    setPlayerDirection("down");
    setDiscoveryMessage("");
    setPaused(false);
    setDialogueIndex(null);
    setWaypointPath([]);
    mapRef.current?.focus({ preventScroll: true });
  }

  function handleMapPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    mapRef.current?.focus({ preventScroll: true });
    const target = event.target as HTMLElement;
    if (target.closest("button, [role='dialog'], .childhood-map__hud, .childhood-map__objective, .childhood-map__minimap")) {
      return;
    }
    if (pauseOpen || dialogueIndex !== null || sceneIndex !== null) return;
    if (tutorialOpen) dismissTutorial();

    const bounds = event.currentTarget.getBoundingClientRect();
    const point = clampWorldPoint({
      x: ((event.clientX - bounds.left) / cameraZoom) + camera.x,
      y: ((event.clientY - bounds.top) / cameraZoom) + camera.y,
    }, gameWorld);
    if (isBlocked(point)) {
      setDiscoveryMessage("Lối này đang bị một kỷ niệm chắn mất. Hãy chọn điểm gần đó.");
      return;
    }
    routeTo(point, "tap");
  }

  function handleMapKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (sceneIndex !== null) {
        setSceneIndex(null);
        return;
      }
      if (dialogueIndex !== null) {
        setDialogueIndex(null);
        return;
      }
      setPaused(!pauseOpen);
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
      if (!pauseOpen && dialogueIndex === null && sceneIndex === null) {
        setWaypointPath([]);
        const nudge = movePlayer(playerPositionRef.current, direction, gameWorld.width * 0.0225);
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
  const playerMiniMapStyle = {
    left: `${(playerPosition.x / gameWorld.width) * 100}%`,
    top: `${(playerPosition.y / gameWorld.height) * 100}%`,
  } as CSSProperties;
  const waypointPathStyle = waypoint ? {
    left: `${playerPosition.x}px`,
    top: `${playerPosition.y}px`,
    width: `${Math.hypot(waypoint.x - playerPosition.x, waypoint.y - playerPosition.y)}px`,
    transform: `rotate(${Math.atan2(waypoint.y - playerPosition.y, waypoint.x - playerPosition.x)}rad)`,
  } as CSSProperties : null;

  return (
    <section className="childhood-map" aria-labelledby="childhood-map-title" data-complete={voucherRevealed} data-phase={gamePhase}>
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
        onPointerDown={handleMapPointerDown}
        onKeyUp={(event) => {
          const direction = directionFromKey(event.key);
          if (direction) setHeldDirection(direction, false);
        }}
      >
        <div ref={worldRef} className="childhood-map__world" style={worldStyle}>
          <MapArtwork />
          <FarmMapDecor />
          <div className="childhood-map__route" aria-hidden="true" />
          {waypointPathStyle ? <span ref={waypointLineRef} className="story-rpg-waypoint-path" style={waypointPathStyle} aria-hidden="true" /> : null}
          {pixelQuest.zones.map((zone, index) => {
            const enabled = isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length);
            const visited = isMemoryStationVisited(index, completedChapterCount, voucherRevealed);
            const active = index === activeIndex;
            const target = zoneToWorldPoint(zone, gameWorld);
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
                onClick={() => travelToStation(index)}
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

          {activeQuest && activeQuestTarget ? (
            <div
              className="story-rpg-target-position"
              style={{ left: `${activeQuestTarget.x}px`, top: `${activeQuestTarget.y}px` }}
            >
              <QuestTarget
                quest={activeQuest}
                nearby={questTargetNearby}
                onSelect={() => routeTo(activeQuestTarget, "objective")}
              />
            </div>
          ) : null}

          <div
            ref={characterRef}
            className={`childhood-map__character tone-${accent} archetype-${childCharacter.archetype}`}
            style={{
              left: `${playerPosition.x}px`,
              top: `${playerPosition.y}px`,
              "--character-x": `${(playerPosition.x / gameWorld.width) * 100}%`,
              "--character-y": `${(playerPosition.y / gameWorld.height) * 100}%`,
            } as CSSProperties}
            data-ready
            data-moving={playerMoving}
            data-direction={playerDirection}
            aria-hidden="true"
          >
            <FarmPixelCharacter
              archetype={childCharacter.archetype}
              direction={playerDirection}
              moving={playerMoving}
              initial={initialsFromName(recipientName).slice(0, 1)}
              fallback={<RoyalPixelCharacter initial={initialsFromName(recipientName).slice(0, 1)} />}
            />
          </div>
        </div>

        <div className="childhood-map__hud">
          <div className="childhood-map__hud-copy"><span>MAP 08</span><strong>{visitedCount}/5 mảnh ký ức</strong><small>{voucherRevealed ? <><span>GIFT OPEN</span> · VOUCHER ĐÃ MỞ</> : nearbyZone ? `GẦN TRẠM ${String(nearbyIndex + 1).padStart(2, "0")}` : "ĐANG KHÁM PHÁ"}</small></div>
          <div className="childhood-map__hud-shards" aria-label={`${visitedCount} trên 5 trạm đã mở`}>
            {pixelQuest.zones.map((zone, index) => <span key={zone.id} data-filled={isMemoryStationVisited(index, completedChapterCount, voucherRevealed)}>{String(index + 1).padStart(2, "0")}</span>)}
          </div>
          <button type="button" className="childhood-map__sound" aria-label={audioEnabled ? "Tắt âm thanh game" : "Bật âm thanh game"} onClick={() => setAudioEnabled((current) => !current)}>
            {audioEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          </button>
          <button type="button" className="childhood-map__pause" aria-label={pauseOpen ? "Tiếp tục hành trình" : "Tạm dừng hành trình"} onClick={() => setPaused(!pauseOpen)}>
            {pauseOpen ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
          </button>
        </div>

        <div className="childhood-map__objective" role="status" aria-live="polite">
          <span><Compass size={13} aria-hidden="true" /> MỤC TIÊU</span>
          <strong>{voucherRevealed ? "Hành trình đã hoàn tất" : activeQuest ? activeQuest.title : nearbyZone && nearbyEnabled ? `Đang ở ${nearbyZone.title}` : `Đi tới ${objectiveZone.title}`}</strong>
          <small>{voucherRevealed ? "Năm mảnh ký ức đã trở về đúng chỗ." : activeQuest ? activeQuest.prompt : `${visitedCount}/5 mảnh ký ức đã được giữ lại`}</small>
        </div>

        <div className="childhood-map__minimap" role="img" aria-label={`Minimap: nhân vật đang ở ${Math.round((playerPosition.x / gameWorld.width) * 100)} phần trăm chiều ngang bản đồ`}>
          <div className="childhood-map__minimap-world">
            <span className="childhood-map__minimap-route" aria-hidden="true" />
            {pixelQuest.zones.map((zone, index) => (
              <span
                key={zone.id}
                className="childhood-map__minimap-station"
                data-enabled={isMemoryStationEnabled(index, completedChapterCount, pixelQuest.zones.length)}
                data-visited={isMemoryStationVisited(index, completedChapterCount, voucherRevealed)}
                style={{ left: `${zone.mapXPercent}%`, top: `${zone.mapYPercent}%` }}
                aria-hidden="true"
              />
            ))}
            <span ref={miniMapPlayerRef} className="childhood-map__minimap-player" style={playerMiniMapStyle} aria-hidden="true" />
          </div>
          <span className="childhood-map__minimap-label">MINIMAP</span>
        </div>

        {discoveryMessage ? (
          <div className="childhood-map__discovery" role="status" aria-live="polite">
            <Sparkles size={15} aria-hidden="true" />
            <span>{discoveryMessage}</span>
          </div>
        ) : null}

        {activeQuest && activeQuestIndex !== null ? (
          <div className="childhood-map__proximity" data-visible={questTargetNearby} data-locked={!questTargetNearby} role="status" aria-live="polite">
            <span>{questTargetNearby ? "ENTER" : "QUEST"}</span>
            <strong>{questTargetNearby ? `Hoàn thành ${activeQuest.targetLabel}` : activeQuest.prompt}</strong>
          </div>
        ) : nearbyZone ? (
          <div className="childhood-map__proximity" data-visible="true" data-locked={!nearbyEnabled} role="status" aria-live="polite">
            <span>{nearbyEnabled ? "ENTER" : "LOCK"}</span>
            <strong>{nearbyEnabled ? `Khám phá ${nearbyZone.title}` : "Mở sau trạm trước"}</strong>
          </div>
        ) : null}

        {dialogueZone && dialogueQuest ? (
          <NpcDialoguePanel
            npc={dialogueNpc}
            zone={dialogueZone}
            quest={dialogueQuest}
            busy={status === "loading"}
            visited={isMemoryStationVisited(dialogueIndex ?? 0, completedChapterCount, voucherRevealed)}
            onAccept={() => beginQuest(dialogueIndex ?? 0)}
            onClose={() => {
              setDialogueIndex(null);
              mapRef.current?.focus({ preventScroll: true });
            }}
          />
        ) : null}

        {activeQuest ? (
          <QuestTracker
            quest={activeQuest}
            nearby={questTargetNearby}
            busy={status === "loading"}
            onComplete={() => void completeActiveQuest()}
          />
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
              <div className="childhood-map__pause-actions">
                <button type="button" className="childhood-map__interact" onClick={() => setPaused(false)}><Play size={16} aria-hidden="true" /> Tiếp tục</button>
                <button type="button" className="childhood-map__pause-secondary" onClick={() => { setPaused(false); setTutorialOpen(true); }}><CircleHelp size={16} aria-hidden="true" /> Xem hướng dẫn</button>
                <button type="button" className="childhood-map__pause-secondary" onClick={resetToActiveStation}><RotateCcw size={16} aria-hidden="true" /> Về trạm hiện tại</button>
              </div>
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
        <button type="button" className="childhood-map__interact" data-state={status === "loading" ? "loading" : status === "error" ? "error" : interactionReady ? "ready" : "disabled"} disabled={!interactionReady || status === "loading"} onClick={interactWithNearbyStation}>{status === "loading" ? <><Loader2 size={16} className="spin-icon" aria-hidden="true" /> Đang lưu...</> : activeQuest ? "Hoàn thành" : "Khám phá"}<kbd>Enter</kbd></button>
      </div>

      <div className="childhood-map__details" data-scene={activeZone.scene}>
        <div className="childhood-map__photo">
          {activeImage ? <Image src={activeImage.url} alt={activeImage.alt} width={720} height={540} sizes="(max-width: 640px) 92vw, 560px" unoptimized /> : <div className="childhood-map__photo-placeholder" aria-label="Chưa có ảnh thật cho trạm này"><span aria-hidden="true" /><strong>Khung ảnh ký ức</strong><small>Admin có thể thêm ảnh thật cho đúng trạm.</small></div>}
        </div>
        <div className="childhood-map__story"><div className="childhood-map__story-heading"><span>Trạm {String(activeIndex + 1).padStart(2, "0")}</span><strong>{activeZone.title}</strong></div><p>{activeImage?.caption || activeZone.npcLine}</p><dl><div><dt>Nhân vật</dt><dd>{childCharacter.name} · {CHARACTER_LABELS[childCharacter.archetype]}</dd></div><div><dt>Tính cách</dt><dd>{childCharacter.trait}</dd></div></dl><div className="childhood-map__status" role="status" aria-live="polite">{status === "loading" ? <><Loader2 className="spin-icon" size={18} aria-hidden="true" /> Đang cất mảnh ký ức này...</> : status === "error" && errorMessage ? <><LockKeyhole size={18} aria-hidden="true" /> {errorMessage}</> : activeVisited ? <><Check size={18} aria-hidden="true" /> {activeIndex === 4 ? "Voucher đã mở." : "Mảnh ký ức đã được giữ lại."}</> : <><MapPin size={18} aria-hidden="true" /> Tới trạm trên bản đồ để mở ký ức.</>}</div>{status === "error" && !activeVisited ? <button type="button" className="childhood-map__retry" onClick={() => activeQuest ? void completeActiveQuest() : travelToStation(activeIndex)}><RotateCcw size={18} aria-hidden="true" /><span>Thử lại trạm này</span></button> : null}</div>
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
