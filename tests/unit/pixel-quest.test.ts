import { describe, expect, it } from "vitest";
import {
  clampCameraOffset,
  createPixelQuestState,
  pixelQuestReducer,
} from "@/components/birthday/pixel-quest";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";

describe("pixel quest state machine", () => {
  it("moves through all three distant checkpoints without a fail state", () => {
    let state = createPixelQuestState("chapter-1", DEFAULT_PIXEL_QUEST);
    state = pixelQuestReducer(state, {
      type: "resize",
      viewportWidth: 320,
      config: DEFAULT_PIXEL_QUEST,
    });

    for (let step = 0; step < 18; step += 1) {
      state = pixelQuestReducer(state, {
        type: "move",
        direction: 1,
        config: DEFAULT_PIXEL_QUEST,
      });
    }

    expect(state.playerPosition).toBe(1520);
    expect(state.visitedCheckpointIds).toEqual(
      DEFAULT_PIXEL_QUEST.zones.map((zone) => zone.id),
    );
    expect(state.questCompleted).toBe(true);
    expect(state.moveCount).toBe(18);
  });

  it("clamps the camera at the start, middle, and end of the world", () => {
    expect(clampCameraOffset(80, 320, 1800)).toBe(0);
    expect(clampCameraOffset(960, 320, 1800)).toBe(-800);
    expect(clampCameraOffset(1760, 320, 1800)).toBe(-1480);
    expect(clampCameraOffset(1760, 768, 1800)).toBe(-1032);
  });
});
