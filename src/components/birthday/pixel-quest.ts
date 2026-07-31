import type { PublicPixelQuestConfigDTO } from "@/lib/birthday/types";
import { pixelQuestConfigSignature } from "./memory-game-engine";

export const PIXEL_QUEST_PROGRESS_VERSION = 3 as const;

export interface PixelQuestProgress {
  version: typeof PIXEL_QUEST_PROGRESS_VERSION;
  journeyId: string;
  configSignature: string;
  activeCheckpointId: string;
  moveCount: number;
}

export interface PixelQuestState extends PixelQuestProgress {
  hydrated: boolean;
}

export type PixelQuestAction =
  | {
      type: "select";
      checkpointId: string;
      completedChapterCount: number;
      config: PublicPixelQuestConfigDTO;
    }
  | {
      type: "sync";
      completedChapterCount: number;
      config: PublicPixelQuestConfigDTO;
    }
  | {
      type: "restore";
      progress: unknown;
      completedChapterCount: number;
      config: PublicPixelQuestConfigDTO;
    }
  | { type: "hydrate" };

export function maximumReachableStationIndex(
  completedChapterCount: number,
  stationCount: number,
) {
  return Math.min(
    Math.max(0, stationCount - 1),
    Math.max(0, Math.floor(completedChapterCount)),
  );
}

export function isMemoryStationEnabled(
  stationIndex: number,
  completedChapterCount: number,
  stationCount: number,
) {
  return stationIndex >= 0
    && stationIndex < stationCount
    && stationIndex <= maximumReachableStationIndex(completedChapterCount, stationCount);
}

export function isMemoryStationVisited(
  stationIndex: number,
  completedChapterCount: number,
  voucherRevealed: boolean,
) {
  return stationIndex < 4
    ? completedChapterCount > stationIndex
    : voucherRevealed;
}

export function createPixelQuestState(
  journeyId: string,
  config: PublicPixelQuestConfigDTO,
): PixelQuestState {
  return {
    version: PIXEL_QUEST_PROGRESS_VERSION,
    journeyId,
    configSignature: pixelQuestConfigSignature(config),
    activeCheckpointId: config.zones[0]?.id ?? "childhood-home",
    moveCount: 0,
    hydrated: false,
  };
}

export function pixelQuestReducer(
  state: PixelQuestState,
  action: PixelQuestAction,
): PixelQuestState {
  switch (action.type) {
    case "select": {
      const stationIndex = action.config.zones.findIndex(
        (zone) => zone.id === action.checkpointId,
      );

      if (!isMemoryStationEnabled(
        stationIndex,
        action.completedChapterCount,
        action.config.zones.length,
      )) {
        return state;
      }

      return {
        ...state,
        activeCheckpointId: action.checkpointId,
        moveCount: state.moveCount + (
          action.checkpointId === state.activeCheckpointId ? 0 : 1
        ),
      };
    }

    case "sync": {
      const activeIndex = action.config.zones.findIndex(
        (zone) => zone.id === state.activeCheckpointId,
      );
      const maximumIndex = maximumReachableStationIndex(
        action.completedChapterCount,
        action.config.zones.length,
      );

      if (activeIndex >= 0 && activeIndex <= maximumIndex) return state;

      return {
        ...state,
        activeCheckpointId: action.config.zones[maximumIndex]?.id
          ?? action.config.zones[0]?.id
          ?? state.activeCheckpointId,
      };
    }

    case "restore":
      return restorePixelQuestState(state, action.progress, action);

    case "hydrate":
      return { ...state, hydrated: true };

    default:
      return state;
  }
}

export function pixelQuestProgress(state: PixelQuestState): PixelQuestProgress {
  return {
    version: state.version,
    journeyId: state.journeyId,
    configSignature: state.configSignature,
    activeCheckpointId: state.activeCheckpointId,
    moveCount: state.moveCount,
  };
}

function restorePixelQuestState(
  state: PixelQuestState,
  progress: unknown,
  action: Extract<PixelQuestAction, { type: "restore" }>,
): PixelQuestState {
  if (!progress || typeof progress !== "object" || Array.isArray(progress)) {
    return { ...state, hydrated: true };
  }

  const candidate = progress as Partial<PixelQuestProgress>;
  const activeIndex = action.config.zones.findIndex(
    (zone) => zone.id === candidate.activeCheckpointId,
  );

  if (
    candidate.version !== PIXEL_QUEST_PROGRESS_VERSION
    || candidate.journeyId !== state.journeyId
    || candidate.configSignature !== pixelQuestConfigSignature(action.config)
    || !isMemoryStationEnabled(
      activeIndex,
      action.completedChapterCount,
      action.config.zones.length,
    )
  ) {
    return pixelQuestReducer(
      { ...state, hydrated: true },
      {
        type: "sync",
        completedChapterCount: action.completedChapterCount,
        config: action.config,
      },
    );
  }

  const moveCount = typeof candidate.moveCount === "number"
    && Number.isInteger(candidate.moveCount)
    && candidate.moveCount >= 0
    ? Math.min(candidate.moveCount, 10000)
    : 0;

  return {
    ...state,
    activeCheckpointId: candidate.activeCheckpointId as string,
    moveCount,
    hydrated: true,
  };
}
