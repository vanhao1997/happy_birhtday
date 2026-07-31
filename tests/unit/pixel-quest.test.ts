import { describe, expect, it } from "vitest";
import {
  createPixelQuestState,
  isMemoryStationEnabled,
  isMemoryStationVisited,
  maximumReachableStationIndex,
  pixelQuestReducer,
} from "@/components/birthday/pixel-quest";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";

describe("childhood memory map state", () => {
  it("opens one new station for every completed server chapter", () => {
    expect(maximumReachableStationIndex(0, 5)).toBe(0);
    expect(maximumReachableStationIndex(2, 5)).toBe(2);
    expect(maximumReachableStationIndex(4, 5)).toBe(4);
    expect(isMemoryStationEnabled(3, 2, 5)).toBe(false);
    expect(isMemoryStationEnabled(3, 3, 5)).toBe(true);
  });

  it("moves across the 2D station sequence without a fail state", () => {
    let state = createPixelQuestState("journey-1", DEFAULT_PIXEL_QUEST);

    state = pixelQuestReducer(state, {
      type: "select",
      checkpointId: DEFAULT_PIXEL_QUEST.zones[2].id,
      completedChapterCount: 1,
      config: DEFAULT_PIXEL_QUEST,
    });
    expect(state.activeCheckpointId).toBe(DEFAULT_PIXEL_QUEST.zones[0].id);

    state = pixelQuestReducer(state, {
      type: "select",
      checkpointId: DEFAULT_PIXEL_QUEST.zones[1].id,
      completedChapterCount: 1,
      config: DEFAULT_PIXEL_QUEST,
    });
    expect(state.activeCheckpointId).toBe(DEFAULT_PIXEL_QUEST.zones[1].id);
    expect(state.moveCount).toBe(1);
  });

  it("treats the fifth station as visited only after voucher reveal", () => {
    expect(isMemoryStationVisited(0, 1, false)).toBe(true);
    expect(isMemoryStationVisited(3, 4, false)).toBe(true);
    expect(isMemoryStationVisited(4, 4, false)).toBe(false);
    expect(isMemoryStationVisited(4, 4, true)).toBe(true);
  });
});
