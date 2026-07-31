import type { PublicPixelQuestConfigDTO } from "@/lib/birthday/types";

export const PIXEL_QUEST_MOVE_PX = 80;
export const PIXEL_QUEST_PROGRESS_VERSION = 1 as const;

export interface PixelQuestProgress {
  version: typeof PIXEL_QUEST_PROGRESS_VERSION;
  chapterId: string;
  playerPosition: number;
  visitedCheckpointIds: string[];
  activeCheckpointId: string | null;
  moveCount: number;
  questCompleted: boolean;
}

export interface PixelQuestState extends PixelQuestProgress {
  viewportWidth: number;
  cameraPosition: number;
  hydrated: boolean;
}

export type PixelQuestAction =
  | { type: "move"; direction: -1 | 1; config: PublicPixelQuestConfigDTO }
  | { type: "visit"; checkpointId: string; config: PublicPixelQuestConfigDTO }
  | { type: "resize"; viewportWidth: number; config: PublicPixelQuestConfigDTO }
  | { type: "restore"; progress: unknown; config: PublicPixelQuestConfigDTO }
  | { type: "hydrate"; config: PublicPixelQuestConfigDTO };

export function clampCameraOffset(
  playerPosition: number,
  viewportWidth: number,
  worldWidth: number,
) {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const minimumOffset = Math.min(0, safeViewportWidth - worldWidth);
  const centeredOffset = safeViewportWidth / 2 - playerPosition;
  return Math.max(minimumOffset, Math.min(0, centeredOffset));
}

export function createPixelQuestState(
  chapterId: string,
  config: PublicPixelQuestConfigDTO,
): PixelQuestState {
  return {
    version: PIXEL_QUEST_PROGRESS_VERSION,
    chapterId,
    playerPosition: config.startPosition,
    visitedCheckpointIds: [],
    activeCheckpointId: null,
    moveCount: 0,
    questCompleted: false,
    viewportWidth: 0,
    cameraPosition: 0,
    hydrated: false,
  };
}

export function pixelQuestReducer(
  state: PixelQuestState,
  action: PixelQuestAction,
): PixelQuestState {
  switch (action.type) {
    case "move": {
      const maximumPosition = Math.max(action.config.startPosition, action.config.worldWidthPx - 80);
      const playerPosition = Math.min(
        maximumPosition,
        Math.max(
          action.config.startPosition,
          state.playerPosition + action.direction * PIXEL_QUEST_MOVE_PX,
        ),
      );
      const crossedZones = action.direction > 0
        ? action.config.zones.filter(
            (zone) => zone.checkpointPosition > state.playerPosition
              && zone.checkpointPosition <= playerPosition,
          )
        : [];
      const visitedCheckpointIds = uniqueCheckpointIds(
        [...state.visitedCheckpointIds, ...crossedZones.map((zone) => zone.id)],
        action.config,
      );
      const activeCheckpointId = crossedZones.at(-1)?.id ?? state.activeCheckpointId;

      return finishState({
        ...state,
        playerPosition,
        visitedCheckpointIds,
        activeCheckpointId,
        moveCount: state.moveCount + (playerPosition === state.playerPosition ? 0 : 1),
      }, action.config);
    }

    case "visit": {
      const zoneIndex = action.config.zones.findIndex((zone) => zone.id === action.checkpointId);
      if (zoneIndex < 0) return state;

      const previousZone = action.config.zones[zoneIndex - 1];
      if (previousZone && !state.visitedCheckpointIds.includes(previousZone.id)) {
        return state;
      }

      const zone = action.config.zones[zoneIndex];
      return finishState({
        ...state,
        playerPosition: zone.checkpointPosition,
        visitedCheckpointIds: uniqueCheckpointIds(
          [...state.visitedCheckpointIds, zone.id],
          action.config,
        ),
        activeCheckpointId: zone.id,
        moveCount: state.moveCount + (zone.checkpointPosition === state.playerPosition ? 0 : 1),
      }, action.config);
    }

    case "resize": {
      const viewportWidth = Math.max(0, Math.round(action.viewportWidth));
      return {
        ...state,
        viewportWidth,
        cameraPosition: clampCameraOffset(
          state.playerPosition,
          viewportWidth,
          action.config.worldWidthPx,
        ),
      };
    }

    case "restore":
      return restorePixelQuestState(state, action.progress, action.config);

    case "hydrate":
      return { ...state, hydrated: true };

    default:
      return state;
  }
}

export function pixelQuestProgress(state: PixelQuestState): PixelQuestProgress {
  return {
    version: state.version,
    chapterId: state.chapterId,
    playerPosition: state.playerPosition,
    visitedCheckpointIds: state.visitedCheckpointIds,
    activeCheckpointId: state.activeCheckpointId,
    moveCount: state.moveCount,
    questCompleted: state.questCompleted,
  };
}

function finishState(
  state: PixelQuestState,
  config: PublicPixelQuestConfigDTO,
): PixelQuestState {
  return {
    ...state,
    questCompleted: state.visitedCheckpointIds.length === config.zones.length,
    cameraPosition: clampCameraOffset(
      state.playerPosition,
      state.viewportWidth,
      config.worldWidthPx,
    ),
  };
}

function restorePixelQuestState(
  state: PixelQuestState,
  progress: unknown,
  config: PublicPixelQuestConfigDTO,
): PixelQuestState {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return { ...state, hydrated: true };
  }

  const candidate = progress as Partial<PixelQuestProgress>;
  if (
    candidate.version !== PIXEL_QUEST_PROGRESS_VERSION
    || candidate.chapterId !== state.chapterId
  ) {
    return { ...state, hydrated: true };
  }

  const maximumPosition = Math.max(config.startPosition, config.worldWidthPx - 80);
  const playerPosition = typeof candidate.playerPosition === "number"
    ? Math.min(maximumPosition, Math.max(config.startPosition, candidate.playerPosition))
    : config.startPosition;
  const visitedCheckpointIds = uniqueCheckpointIds(
    Array.isArray(candidate.visitedCheckpointIds)
      ? candidate.visitedCheckpointIds.filter((id): id is string => typeof id === "string")
      : [],
    config,
  );
  const activeCheckpointId = typeof candidate.activeCheckpointId === "string"
    && visitedCheckpointIds.includes(candidate.activeCheckpointId)
    ? candidate.activeCheckpointId
    : visitedCheckpointIds.at(-1) ?? null;
  const moveCount = typeof candidate.moveCount === "number"
    && Number.isInteger(candidate.moveCount)
    && candidate.moveCount >= 0
    ? Math.min(candidate.moveCount, 10000)
    : 0;

  return finishState({
    ...state,
    playerPosition,
    visitedCheckpointIds,
    activeCheckpointId,
    moveCount,
    hydrated: true,
  }, config);
}

function uniqueCheckpointIds(
  ids: string[],
  config: PublicPixelQuestConfigDTO,
) {
  const visited = new Set(ids);
  return config.zones
    .map((zone) => zone.id)
    .filter((id) => visited.has(id));
}
