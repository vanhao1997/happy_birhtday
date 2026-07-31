"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { Check, Sparkles, X } from "lucide-react";
import type {
  PublicMemoryNpcDTO,
  PublicMemoryQuestDTO,
  PublicPixelQuestZoneDTO,
} from "@/lib/birthday/types";

type DialoguePanelProps = {
  npc: PublicMemoryNpcDTO | null;
  zone: PublicPixelQuestZoneDTO;
  quest: PublicMemoryQuestDTO;
  busy: boolean;
  visited: boolean;
  onAccept: () => void;
  onClose: () => void;
};

export function NpcDialoguePanel({
  npc,
  zone,
  quest,
  busy,
  visited,
  onAccept,
  onClose,
}: DialoguePanelProps) {
  const acceptRef = useRef<HTMLButtonElement | null>(null);
  const portraitSrc = npc?.archetype === "orc"
    ? "/assets/pixel/characters/orc-idle.png"
      : "/assets/pixel/characters/soldier-idle.png";

  useEffect(() => {
    acceptRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="story-rpg-dialogue" role="dialog" aria-labelledby="story-rpg-dialogue-title">
      <div className="story-rpg-dialogue__portrait" data-archetype={npc?.archetype ?? "guide"} aria-hidden="true">
        <Image src={portraitSrc} alt="" width={600} height={100} unoptimized />
      </div>
      <div className="story-rpg-dialogue__copy">
        <span>{npc?.role ?? "Người dẫn đường"}</span>
        <h3 id="story-rpg-dialogue-title">{npc?.name ?? zone.title}</h3>
        <p>{npc?.line ?? zone.npcLine}</p>
        <div className="story-rpg-dialogue__quest">
          <Sparkles size={16} aria-hidden="true" />
          <div><strong>{quest.title}</strong><small>{quest.prompt}</small></div>
        </div>
        <button ref={acceptRef} type="button" className="story-rpg-dialogue__accept" disabled={busy} onClick={onAccept}>
          {visited ? <><Check size={16} aria-hidden="true" /> Xem lại ký ức</> : "Bắt đầu nhiệm vụ"}
        </button>
      </div>
      <button type="button" className="story-rpg-dialogue__close" aria-label="Đóng lời thoại" onClick={onClose}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

type QuestTargetProps = {
  quest: PublicMemoryQuestDTO;
  nearby: boolean;
  onSelect: () => void;
};

export function QuestTarget({ quest, nearby, onSelect }: QuestTargetProps) {
  const asset = quest.type === "talk"
    ? "/assets/pixel/characters/soldier-idle.png"
    : quest.type === "deliver"
      ? "/assets/pixel/farm/crop-berry.png"
      : "/assets/pixel/farm/chest.png";
  const assetSize = quest.type === "talk"
    ? { width: 600, height: 100 }
    : quest.type === "deliver"
      ? { width: 16, height: 16 }
      : { width: 32, height: 32 };

  return (
    <button
      type="button"
      className="story-rpg-target"
      data-quest-type={quest.type}
      data-nearby={nearby}
      aria-label={`Mục tiêu nhiệm vụ: ${quest.targetLabel}`}
      onClick={onSelect}
    >
      <span className="story-rpg-target__glow" aria-hidden="true" />
      <span className="story-rpg-target__icon" aria-hidden="true">
        <Image src={asset} alt="" width={assetSize.width} height={assetSize.height} unoptimized />
      </span>
      <strong>{quest.targetLabel}</strong>
    </button>
  );
}

type QuestTrackerProps = {
  quest: PublicMemoryQuestDTO;
  nearby: boolean;
  busy: boolean;
  onComplete: () => void;
};

export function QuestTracker({ quest, nearby, busy, onComplete }: QuestTrackerProps) {
  return (
    <aside className="story-rpg-tracker" aria-live="polite">
      <span>NHIỆM VỤ ĐANG LÀM</span>
      <strong>{quest.title}</strong>
      <small>{nearby ? "Đã tới mục tiêu. Nhấn Enter hoặc Hoàn thành." : quest.prompt}</small>
      <button type="button" disabled={!nearby || busy} onClick={onComplete}>
        {busy ? "Đang lưu..." : "Hoàn thành"}
      </button>
    </aside>
  );
}
