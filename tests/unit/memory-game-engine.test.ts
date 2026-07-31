import { describe, expect, it } from "vitest";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";
import {
  calculateCamera,
  isBlocked,
  MEMORY_COLLISION_RECTS,
  MEMORY_WORLD,
  movePlayer,
  nearestZoneIndex,
  playerStartPoint,
  zoneToWorldPoint,
} from "@/components/birthday/memory-game-engine";

describe("memory game engine", () => {
  it("converts public zone percentages into the large pixel world", () => {
    const point = zoneToWorldPoint(DEFAULT_PIXEL_QUEST.zones[0]!);
    expect(point.x).toBeCloseTo(252);
    expect(point.y).toBeCloseTo(832.2);
  });

  it("keeps the camera inside the world at every edge", () => {
    expect(calculateCamera({ x: 10, y: 10 }, { width: 400, height: 300 }))
      .toEqual({ x: 0, y: 0 });
    expect(calculateCamera({ x: 1790, y: 1130 }, { width: 400, height: 300 }))
      .toEqual({ x: 1400, y: 840 });
  });

  it("blocks landmark collision without moving the avatar through it", () => {
    const home = MEMORY_COLLISION_RECTS.find((rect) => rect.label === "home")!;
    const start = { x: home.x + home.width + MEMORY_WORLD.playerRadius + 1, y: home.y + 40 };
    const next = movePlayer(start, "left", 40);
    expect(next).toEqual(start);
    expect(isBlocked(next)).toBe(false);
  });

  it("keeps all five station approach points reachable", () => {
    DEFAULT_PIXEL_QUEST.zones.forEach((zone, index) => {
      const approach = playerStartPoint(zone);
      expect(isBlocked(approach), `station ${index + 1} approach`).toBe(false);
      expect(nearestZoneIndex(approach, DEFAULT_PIXEL_QUEST.zones)).toBe(index);
    });
  });
});
