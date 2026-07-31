import type {
  PublicMemoryQuestDTO,
  PublicPixelQuestConfigDTO,
  PublicPixelQuestWorldDTO,
  PublicPixelQuestZoneDTO,
} from "@/lib/birthday/types";

export type GameDirection = "up" | "down" | "left" | "right";
export type MemoryGamePhase =
  | "boot"
  | "intro"
  | "exploring"
  | "dialogue"
  | "quest_active"
  | "memory_reveal"
  | "paused"
  | "completed"
  | "error";

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

export type MemoryWorldMetrics = {
  width: number;
  height: number;
  playerRadius: number;
  stationRadius: number;
  speed: number;
};

export const MEMORY_WORLD: MemoryWorldMetrics = {
  width: 1800,
  height: 1120,
  playerRadius: 22,
  stationRadius: 112,
  speed: 230,
};

// Render the world slightly zoomed out so the player can orient around nearby landmarks.
export const MEMORY_CAMERA_ZOOM = 0.76;

export function worldMetrics(world: PublicPixelQuestWorldDTO): MemoryWorldMetrics {
  return {
    width: world.widthPx,
    height: world.heightPx,
    playerRadius: world.playerRadiusPx,
    stationRadius: world.stationRadiusPx,
    speed: MEMORY_WORLD.speed,
  };
}

export function pixelQuestConfigSignature(config: PublicPixelQuestConfigDTO) {
  return JSON.stringify({
    version: config.version,
    world: config.world,
    zones: config.zones.map((zone) => [zone.id, zone.mapXPercent, zone.mapYPercent]),
    quests: config.quests.map((quest) => [quest.id, quest.nodeId, quest.type]),
  });
}

export type Waypoint = GamePoint & {
  source: "tap" | "objective";
};

export function phaseForState(input: {
  hydrated: boolean;
  tutorialOpen: boolean;
  pauseOpen: boolean;
  dialogueOpen: boolean;
  questActive: boolean;
  sceneOpen: boolean;
  completed: boolean;
  error: boolean;
}): MemoryGamePhase {
  if (input.error) return "error";
  if (!input.hydrated) return "boot";
  if (input.completed) return "completed";
  if (input.pauseOpen) return "paused";
  if (input.sceneOpen) return "memory_reveal";
  if (input.dialogueOpen) return "dialogue";
  if (input.questActive) return "quest_active";
  if (input.tutorialOpen) return "intro";
  return "exploring";
}

export function questForZone(
  zone: Pick<PublicPixelQuestZoneDTO, "id">,
  quests: PublicMemoryQuestDTO[],
): PublicMemoryQuestDTO | null {
  return quests.find((quest) => quest.nodeId === zone.id) ?? null;
}

export function waypointForZone(
  zone: Pick<PublicPixelQuestZoneDTO, "mapXPercent" | "mapYPercent">,
  world: MemoryWorldMetrics = MEMORY_WORLD,
): Waypoint {
  return { ...playerStartPoint(zone, world), source: "objective" };
}

export function moveToward(
  current: GamePoint,
  target: GamePoint,
  distance: number,
): GamePoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const length = Math.hypot(dx, dy);
  if (length <= distance || length === 0) return target;
  return {
    x: current.x + (dx / length) * distance,
    y: current.y + (dy / length) * distance,
  };
}

export function moveTowardWithCollision(
  current: GamePoint,
  target: GamePoint,
  distance: number,
  collisionRects: CollisionRect[] = MEMORY_COLLISION_RECTS,
): GamePoint {
  const next = moveToward(current, target, distance);
  if (!isBlocked(next, collisionRects)) return next;

  const xOnly = { x: next.x, y: current.y };
  if (!isBlocked(xOnly, collisionRects)) return xOnly;
  const yOnly = { x: current.x, y: next.y };
  if (!isBlocked(yOnly, collisionRects)) return yOnly;
  return current;
}

export function directionToward(current: GamePoint, target: GamePoint): GameDirection {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

function segmentIsClear(
  start: GamePoint,
  end: GamePoint,
  collisionRects: CollisionRect[],
  step = 24,
) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const samples = Math.max(1, Math.ceil(distance / step));
  for (let index = 1; index <= samples; index += 1) {
    const ratio = index / samples;
    if (isBlocked({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    }, collisionRects)) return false;
  }
  return true;
}

export function findWaypointPath(
  start: GamePoint,
  target: GamePoint,
  world: MemoryWorldMetrics = MEMORY_WORLD,
  collisionRects: CollisionRect[] = MEMORY_COLLISION_RECTS,
  gridSize = 48,
): GamePoint[] {
  if (segmentIsClear(start, target, collisionRects)) return [target];

  const columns = Math.max(2, Math.floor(world.width / gridSize));
  const rows = Math.max(2, Math.floor(world.height / gridSize));
  const toPoint = (column: number, row: number): GamePoint => ({
    x: clamp(column * gridSize, world.playerRadius, world.width - world.playerRadius),
    y: clamp(row * gridSize, world.playerRadius, world.height - world.playerRadius),
  });
  const toCell = (point: GamePoint) => ({
    column: clamp(Math.round(point.x / gridSize), 0, columns),
    row: clamp(Math.round(point.y / gridSize), 0, rows),
  });
  const key = (column: number, row: number) => `${column}:${row}`;
  const startCell = toCell(start);
  let goalCell = toCell(target);

  if (isBlocked(toPoint(goalCell.column, goalCell.row), collisionRects)) {
    const alternatives = [
      [0, 1], [1, 0], [0, -1], [-1, 0],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    const available = alternatives
      .map(([column, row]) => ({
        column: clamp(goalCell.column + column, 0, columns),
        row: clamp(goalCell.row + row, 0, rows),
      }))
      .find((cell) => !isBlocked(toPoint(cell.column, cell.row), collisionRects));
    if (available) goalCell = available;
  }

  const startKey = key(startCell.column, startCell.row);
  const goalKey = key(goalCell.column, goalCell.row);
  const open = new Set([startKey]);
  const cells = new Map([[startKey, startCell], [goalKey, goalCell]]);
  const cameFrom = new Map<string, string>();
  const score = new Map([[startKey, 0]]);
  const estimate = new Map([[startKey, Math.abs(goalCell.column - startCell.column) + Math.abs(goalCell.row - startCell.row)]]);

  for (let iteration = 0; open.size > 0 && iteration < 5000; iteration += 1) {
    const currentKey = [...open].reduce((best, candidate) => (
      (estimate.get(candidate) ?? Number.POSITIVE_INFINITY)
        < (estimate.get(best) ?? Number.POSITIVE_INFINITY)
        ? candidate
        : best
    ));
    if (currentKey === goalKey) {
      const route: GamePoint[] = [];
      let cursor = currentKey;
      while (cursor !== startKey) {
        const cell = cells.get(cursor);
        if (!cell) break;
        route.unshift(toPoint(cell.column, cell.row));
        const previous = cameFrom.get(cursor);
        if (!previous) break;
        cursor = previous;
      }
      if (route.length === 0 || segmentIsClear(route.at(-1) ?? start, target, collisionRects)) {
        route.push(target);
      }
      return route;
    }

    open.delete(currentKey);
    const current = cells.get(currentKey)!;
    const neighbors = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const [columnOffset, rowOffset] of neighbors) {
      const column = current.column + columnOffset;
      const row = current.row + rowOffset;
      if (column < 0 || row < 0 || column > columns || row > rows) continue;
      const point = toPoint(column, row);
      if (isBlocked(point, collisionRects)) continue;
      const neighborKey = key(column, row);
      cells.set(neighborKey, { column, row });
      const candidateScore = (score.get(currentKey) ?? Number.POSITIVE_INFINITY) + 1;
      if (candidateScore >= (score.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;
      cameFrom.set(neighborKey, currentKey);
      score.set(neighborKey, candidateScore);
      estimate.set(
        neighborKey,
        candidateScore + Math.abs(goalCell.column - column) + Math.abs(goalCell.row - row),
      );
      open.add(neighborKey);
    }
  }

  return [];
}

/** Keeps keyboard and touch movement deterministic when several directions are held. */
export function latestHeldDirection(
  heldDirections: ReadonlySet<GameDirection>,
  fallback: GameDirection,
): GameDirection {
  let latest = fallback;
  heldDirections.forEach((direction) => {
    latest = direction;
  });
  return latest;
}

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
  world: MemoryWorldMetrics = MEMORY_WORLD,
): GamePoint {
  return {
    x: (zone.mapXPercent / 100) * world.width,
    y: (zone.mapYPercent / 100) * world.height,
  };
}

export function playerStartPoint(
  zone: Pick<PublicPixelQuestZoneDTO, "mapXPercent" | "mapYPercent">,
  world: MemoryWorldMetrics = MEMORY_WORLD,
): GamePoint {
  const target = zoneToWorldPoint(zone, world);
  const approaches = [
    { x: 72, y: 70 },
    { x: 64, y: 88 },
    { x: -72, y: 70 },
    { x: 0, y: 96 },
  ];

  for (const offset of approaches) {
    const point = {
      x: clamp(target.x + offset.x, world.playerRadius, world.width - world.playerRadius),
      y: clamp(target.y + offset.y, world.playerRadius, world.height - world.playerRadius),
    };
    if (!isBlocked(point)) return point;
  }

  return target;
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
  radius: number = MEMORY_WORLD.playerRadius,
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
  radius: number = MEMORY_WORLD.stationRadius,
  world: MemoryWorldMetrics = MEMORY_WORLD,
) {
  let nearestIndex = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;

  zones.forEach((zone, index) => {
    const target = zoneToWorldPoint(zone, world);
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
  zoom = 1,
  world: MemoryWorldMetrics = MEMORY_WORLD,
): GamePoint {
  const safeZoom = Math.max(0.5, zoom);
  const visibleWorldWidth = viewport.width / safeZoom;
  const visibleWorldHeight = viewport.height / safeZoom;
  const maxX = Math.max(0, world.width - visibleWorldWidth);
  const maxY = Math.max(0, world.height - visibleWorldHeight);
  return {
    x: clamp(player.x - (visibleWorldWidth / 2), 0, maxX),
    y: clamp(player.y - (visibleWorldHeight / 2), 0, maxY),
  };
}

export function calculateCameraWithDeadZone(
  player: GamePoint,
  viewport: GameViewport,
  previous: GamePoint | null,
  zoom = 1,
  world: MemoryWorldMetrics = MEMORY_WORLD,
  deadZoneRatio = 0.22,
): GamePoint {
  if (!previous || viewport.width <= 0 || viewport.height <= 0) {
    return calculateCamera(player, viewport, zoom, world);
  }

  const safeZoom = Math.max(0.5, zoom);
  const visibleWorldWidth = viewport.width / safeZoom;
  const visibleWorldHeight = viewport.height / safeZoom;
  const horizontalInset = visibleWorldWidth * deadZoneRatio;
  const verticalInset = visibleWorldHeight * deadZoneRatio;
  let x = previous.x;
  let y = previous.y;

  if (player.x < x + horizontalInset) x = player.x - horizontalInset;
  if (player.x > x + visibleWorldWidth - horizontalInset) {
    x = player.x - visibleWorldWidth + horizontalInset;
  }
  if (player.y < y + verticalInset) y = player.y - verticalInset;
  if (player.y > y + visibleWorldHeight - verticalInset) {
    y = player.y - visibleWorldHeight + verticalInset;
  }

  return {
    x: clamp(x, 0, Math.max(0, world.width - visibleWorldWidth)),
    y: clamp(y, 0, Math.max(0, world.height - visibleWorldHeight)),
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
