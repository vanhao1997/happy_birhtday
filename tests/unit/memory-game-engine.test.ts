import { describe, expect, it } from "vitest";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";
import {
  calculateCamera,
  calculateCameraWithDeadZone,
  directionToward,
  findWaypointPath,
  isBlocked,
  latestHeldDirection,
  MEMORY_COLLISION_RECTS,
  MEMORY_WORLD,
  moveToward,
  movePlayer,
  nearestZoneIndex,
  phaseForState,
  pixelQuestConfigSignature,
  playerStartPoint,
  waypointForZone,
  zoneToWorldPoint,
} from "@/components/birthday/memory-game-engine";

describe("memory game engine", () => {
  it("keeps the most recently pressed direction when keys overlap", () => {
    const held = new Set(["right", "down"] as const);
    expect(latestHeldDirection(held, "left")).toBe("down");
    held.delete("down");
    expect(latestHeldDirection(held, "left")).toBe("right");
    held.clear();
    expect(latestHeldDirection(held, "left")).toBe("left");
  });

  it("converts public zone percentages into the large pixel world", () => {
    const point = zoneToWorldPoint(DEFAULT_PIXEL_QUEST.zones[0]!);
    expect(point.x).toBeCloseTo(252);
    expect(point.y).toBeCloseTo(817.6);
  });

  it("keeps the camera inside the world at every edge", () => {
    expect(calculateCamera({ x: 10, y: 10 }, { width: 400, height: 300 }))
      .toEqual({ x: 0, y: 0 });
    expect(calculateCamera({ x: 1790, y: 1110 }, { width: 400, height: 300 }))
      .toEqual({ x: 1400, y: 820 });
  });

  it("shows a wider slice of the world when the camera zooms out", () => {
    const camera = calculateCamera({ x: 900, y: 570 }, { width: 400, height: 300 }, 0.76);
    expect(camera.x).toBeCloseTo(636.8421, 3);
    expect(camera.y).toBeCloseTo(372.6316, 3);
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
      expect(waypointForZone(zone)).toMatchObject(approach);
    });
  });

  it("finds a collision-free route from spawn to every station waypoint", () => {
    DEFAULT_PIXEL_QUEST.zones.forEach((zone, index) => {
      const target = waypointForZone(zone);
      const path = findWaypointPath(DEFAULT_PIXEL_QUEST.world.spawnPoint, target);
      expect(path.length, `station ${index + 1} path`).toBeGreaterThan(0);
      expect(path.every((point) => !isBlocked(point)), `station ${index + 1} route`).toBe(true);
      expect(path.at(-1)).toMatchObject({ x: target.x, y: target.y });
    });
  });

  it("keeps camera still inside its dead-zone and follows outside it", () => {
    const viewport = { width: 600, height: 400 };
    const previous = { x: 400, y: 300 };
    expect(calculateCameraWithDeadZone({ x: 700, y: 500 }, viewport, previous, 1))
      .toEqual(previous);
    expect(calculateCameraWithDeadZone({ x: 1100, y: 500 }, viewport, previous, 1).x)
      .toBeGreaterThan(previous.x);
  });

  it("moves toward waypoints without teleporting", () => {
    expect(moveToward({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)).toEqual({ x: 20, y: 0 });
    expect(directionToward({ x: 10, y: 10 }, { x: 5, y: 50 })).toBe("down");
  });

  it("routes around solid farm landmarks", () => {
    const start = { x: 80, y: 840 };
    const target = { x: 320, y: 840 };
    const path = findWaypointPath(start, target);
    expect(path.length).toBeGreaterThan(1);
    expect(path.every((point) => !isBlocked(point))).toBe(true);
    expect(path.at(-1)).toEqual(target);
  });

  it("derives explicit game phases and world signatures", () => {
    expect(phaseForState({
      hydrated: true,
      tutorialOpen: false,
      pauseOpen: false,
      dialogueOpen: true,
      questActive: false,
      sceneOpen: false,
      completed: false,
      error: false,
    })).toBe("dialogue");
    expect(pixelQuestConfigSignature(DEFAULT_PIXEL_QUEST)).toContain("1800");
  });
});
