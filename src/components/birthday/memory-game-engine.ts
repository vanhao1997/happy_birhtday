import type { PublicPixelQuestZoneDTO } from "@/lib/birthday/types";

export type GameDirection = "up" | "down" | "left" | "right";

export type GamePoint = {
  x: number;
  y: number;
};

export type GameViewport = {
  width: number;
  height: number;
};

export type CollisionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
};

export const MEMORY_WORLD = {
  width: 1800,
  height: 1140,
  playerRadius: 22,
  stationRadius: 112,
  speed: 230,
} as const;

// Landmarks are solid enough to make the map feel like a world, while the
// road and bridge stay open so every memory station remains reachable.
export const MEMORY_COLLISION_RECTS: CollisionRect[] = [
  { x: 108, y: 790, width: 126, height: 112, label: "home" },
  { x: 424, y: 330, width: 188, height: 102, label: "playground" },
  { x: 820, y: 650, width: 336, height: 114, label: "school" },
  { x: 1178, y: 170, width: 188, height: 156, label: "dream-balloon" },
  { x: 1492, y: 704, width: 236, height: 122, label: "new-gate" },
  { x: 0, y: 272, width: 270, height: 98, label: "north-forest" },
  { x: 1370, y: 30, width: 250, height: 116, label: "cloud-hills" },
];

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function zoneToWorldPoint(
  zone: Pick<PublicPixelQuestZoneDTO, "mapXPercent" | "mapYPercent">,
): GamePoint {
  return {
    x: (zone.mapXPercent / 100) * MEMORY_WORLD.width,
    y: (zone.mapYPercent / 100) * MEMORY_WORLD.height,
  };
}

export function playerStartPoint(
  zone: Pick<PublicPixelQuestZoneDTO, "mapXPercent" | "mapYPercent">,
): GamePoint {
  const target = zoneToWorldPoint(zone);
  return {
    x: clamp(target.x + 72, MEMORY_WORLD.playerRadius, MEMORY_WORLD.width - MEMORY_WORLD.playerRadius),
    y: clamp(target.y + 70, MEMORY_WORLD.playerRadius, MEMORY_WORLD.height - MEMORY_WORLD.playerRadius),
  };
}

export function directionVector(direction: GameDirection): GamePoint {
  switch (direction) {
    case "up":
      return { x: 0, y: -1 };
    case "down":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
      return { x: 1, y: 0 };
  }
}

export function pointHitsRect(
  point: GamePoint,
  rect: CollisionRect,
  radius = MEMORY_WORLD.playerRadius,
) {
  const nearestX = clamp(point.x, rect.x, rect.x + rect.width);
  const nearestY = clamp(point.y, rect.y, rect.y + rect.height);
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return (dx * dx) + (dy * dy) < radius * radius;
}

export function isBlocked(
  point: GamePoint,
  collisionRects: CollisionRect[] = MEMORY_COLLISION_RECTS,
) {
  return collisionRects.some((rect) => pointHitsRect(point, rect));
}

export function movePlayer(
  current: GamePoint,
  direction: GameDirection,
  distance: number,
  collisionRects: CollisionRect[] = MEMORY_COLLISION_RECTS,
): GamePoint {
  const vector = directionVector(direction);
  const next = {
    x: clamp(
      current.x + vector.x * distance,
      MEMORY_WORLD.playerRadius,
      MEMORY_WORLD.width - MEMORY_WORLD.playerRadius,
    ),
    y: clamp(
      current.y + vector.y * distance,
      MEMORY_WORLD.playerRadius,
      MEMORY_WORLD.height - MEMORY_WORLD.playerRadius,
    ),
  };

  if (!isBlocked(next, collisionRects)) return next;

  // Axis fallback gives the avatar a clean slide along corners instead of
  // making one small obstacle feel like a dead end.
  const xOnly = { x: next.x, y: current.y };
  if (!isBlocked(xOnly, collisionRects)) return xOnly;
  const yOnly = { x: current.x, y: next.y };
  if (!isBlocked(yOnly, collisionRects)) return yOnly;
  return current;
}

export function nearestZoneIndex(
  point: GamePoint,
  zones: PublicPixelQuestZoneDTO[],
  radius = MEMORY_WORLD.stationRadius,
) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  zones.forEach((zone, index) => {
    const target = zoneToWorldPoint(zone);
    const distance = Math.hypot(point.x - target.x, point.y - target.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return nearestDistance <= radius ? nearestIndex : -1;
}

export function calculateCamera(
  player: GamePoint,
  viewport: GameViewport,
): GamePoint {
  const maxX = Math.max(0, MEMORY_WORLD.width - viewport.width);
  const maxY = Math.max(0, MEMORY_WORLD.height - viewport.height);
  return {
    x: clamp(player.x - (viewport.width / 2), 0, maxX),
    y: clamp(player.y - (viewport.height / 2), 0, maxY),
  };
}

export function isGamePoint(value: unknown): value is GamePoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.x === "number"
    && Number.isFinite(candidate.x)
    && typeof candidate.y === "number"
    && Number.isFinite(candidate.y);
}
