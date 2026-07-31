"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import type { PixelCharacterArchetype } from "@/lib/birthday/types";
import type { GameDirection } from "./memory-game-engine";

const FARM_ASSET_ROOT = "/assets/pixel/farm";
const CHARACTER_ASSET_ROOT = "/assets/pixel/characters";

type PositionedAsset = {
  src: string;
  x: number;
  y: number;
  width: number;
  className?: string;
};

const FARM_OBJECTS: PositionedAsset[] = [
  { src: `${FARM_ASSET_ROOT}/farm-house.png`, x: 126, y: 720, width: 238, className: "farm-map__house" },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 48, y: 432, width: 132 },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 250, y: 354, width: 112 },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 378, y: 842, width: 124 },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 1116, y: 742, width: 126 },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 1328, y: 590, width: 112 },
  { src: `${FARM_ASSET_ROOT}/maple-tree.png`, x: 1540, y: 760, width: 132 },
];

const CROP_PATCHES = [
  [746, 790, "crop-berry.png"],
  [794, 792, "crop-root.png"],
  [842, 790, "crop-berry.png"],
  [746, 838, "crop-root.png"],
  [794, 840, "crop-berry.png"],
  [842, 838, "crop-root.png"],
] as const;

type FarmPixelCharacterProps = {
  archetype: PixelCharacterArchetype;
  direction: GameDirection;
  moving: boolean;
  initial: string;
  fallback: ReactNode;
};

export function FarmPixelCharacter({
  archetype,
  direction,
  moving,
  initial,
  fallback,
}: FarmPixelCharacterProps) {
  const [spriteFailed, setSpriteFailed] = useState(false);

  if (spriteFailed) return fallback;

  return (
    <span
      className="farm-player"
      data-archetype={archetype}
      data-direction={direction}
      data-moving={moving}
    >
      <span className="farm-player__sprite-window">
        {/* Native img keeps the sprite sheet at exact pixel dimensions. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="farm-player__sheet"
          src={`${FARM_ASSET_ROOT}/player-walk.png`}
          alt=""
          width="192"
          height="96"
          draggable={false}
          onError={() => setSpriteFailed(true)}
        />
      </span>
      <span className="farm-player__accessory" aria-hidden="true" />
      <span className="farm-player__initial" aria-hidden="true">{initial}</span>
    </span>
  );
}

type SpriteStripProps = {
  className: string;
  src: string;
  x: number;
  y: number;
  frameWidth: number;
  frameHeight: number;
  sheetWidth: number;
  sheetHeight: number;
  scale: number;
  frames: number;
};

function SpriteStrip({
  className,
  src,
  x,
  y,
  frameWidth,
  frameHeight,
  sheetWidth,
  sheetHeight,
  scale,
  frames,
}: SpriteStripProps) {
  const style = {
    left: `${x}px`,
    top: `${y}px`,
    "--sprite-frame-width": `${frameWidth}px`,
    "--sprite-frame-height": `${frameHeight}px`,
    "--sprite-sheet-width": `${sheetWidth}px`,
    "--sprite-sheet-height": `${sheetHeight}px`,
    "--sprite-scale": scale,
    "--sprite-frames": frames,
  } as CSSProperties;

  return (
    <span className={`farm-map__sprite-strip ${className}`} style={style} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={sheetWidth} height={sheetHeight} draggable={false} />
    </span>
  );
}

export function FarmMapDecor() {
  return (
    <div className="farm-map" aria-hidden="true">
      {FARM_OBJECTS.map((asset, index) => (
        // Decorative pixel sprites must remain unoptimized and nearest-neighbour scaled.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${asset.src}-${index}`}
          className={`farm-map__object ${asset.className ?? ""}`}
          src={asset.src}
          alt=""
          width={asset.width}
          height={Math.round(asset.width * (asset.src.includes("farm-house") ? 1.4 : 1.2))}
          style={{ left: `${asset.x}px`, top: `${asset.y}px`, width: `${asset.width}px` }}
          draggable={false}
        />
      ))}

      <div className="farm-map__field">
        {CROP_PATCHES.map(([x, y, asset]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${x}-${y}`}
            className="farm-map__crop"
            src={`${FARM_ASSET_ROOT}/${asset}`}
            alt=""
            width="48"
            height="48"
            style={{ left: `${x}px`, top: `${y}px` }}
            draggable={false}
          />
        ))}
      </div>

      <SpriteStrip
        className="farm-map__cow"
        src={`${FARM_ASSET_ROOT}/cow.png`}
        x={1008}
        y={790}
        frameWidth={32}
        frameHeight={32}
        sheetWidth={128}
        sheetHeight={96}
        scale={2.7}
        frames={4}
      />
      <SpriteStrip
        className="farm-map__chicken"
        src={`${FARM_ASSET_ROOT}/chicken.png`}
        x={570}
        y={694}
        frameWidth={16}
        frameHeight={16}
        sheetWidth={64}
        sheetHeight={32}
        scale={3.2}
        frames={4}
      />
      <SpriteStrip
        className="farm-map__npc farm-map__npc--soldier"
        src={`${CHARACTER_ASSET_ROOT}/soldier-idle.png`}
        x={1428}
        y={360}
        frameWidth={100}
        frameHeight={100}
        sheetWidth={600}
        sheetHeight={100}
        scale={1.25}
        frames={6}
      />
      <SpriteStrip
        className="farm-map__npc farm-map__npc--orc"
        src={`${CHARACTER_ASSET_ROOT}/orc-idle.png`}
        x={1234}
        y={532}
        frameWidth={100}
        frameHeight={100}
        sheetWidth={600}
        sheetHeight={100}
        scale={1.18}
        frames={6}
      />
    </div>
  );
}
