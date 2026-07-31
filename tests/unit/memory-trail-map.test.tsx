import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PixelMemoryQuest } from "@/components/birthday/BirthdayExperience";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const childCharacter = {
  name: "Bé Mai Mây",
  trait: "Tò mò, thích khám phá",
  archetype: "princess" as const,
};

function renderMap(
  completedChapterCount = 0,
  voucherRevealed = false,
  onOpenStation = vi.fn(),
) {
  return {
    onOpenStation,
    ...render(
      <PixelMemoryQuest
        images={[]}
        pixelQuest={DEFAULT_PIXEL_QUEST}
        recipientName="Mai"
        childCharacter={childCharacter}
        accent="pear"
        sessionId="session-mai"
        completedChapterCount={completedChapterCount}
        voucherRevealed={voucherRevealed}
        status="idle"
        onOpenStation={onOpenStation}
      />,
    ),
  };
}

describe("childhood memory map", () => {
  it("renders a real five-station map with no question controls", () => {
    renderMap();

    expect(screen.getByText("Memory Atlas 2000 · 5 trạm")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /Ngôi nhà tuổi thơ/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Sân chơi mùa hè/ })).toBeDisabled();
    expect(document.querySelector(".prompt-line")).not.toBeInTheDocument();
    expect(document.querySelector(".choice-stack")).not.toBeInTheDocument();
  });

  it("moves the royal child character by selecting an enabled station", () => {
    const { onOpenStation } = renderMap(1);
    const secondStation = screen.getByRole("button", { name: /Sân chơi mùa hè/ });

    fireEvent.click(secondStation);

    expect(secondStation).toHaveAttribute("aria-pressed", "true");
    expect(onOpenStation).toHaveBeenCalledWith(
      1,
      DEFAULT_PIXEL_QUEST.zones[1],
      1,
    );
    expect(document.querySelector(".childhood-map__character")).toHaveClass("archetype-princess");
  });

  it("opens the fifth station only after four server chapters", () => {
    const { rerender } = renderMap(3);
    const gate = screen.getByRole("button", { name: /Cổng tuổi mới/ });
    expect(gate).toBeDisabled();

    rerender(
      <PixelMemoryQuest
        images={[]}
        pixelQuest={DEFAULT_PIXEL_QUEST}
        recipientName="Mai"
        childCharacter={childCharacter}
        accent="pear"
        sessionId="session-mai"
        completedChapterCount={4}
        voucherRevealed={false}
        status="idle"
        onOpenStation={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Cổng tuổi mới/ })).toBeEnabled();
  });

  it("marks the final gate complete after voucher reveal", () => {
    renderMap(4, true);

    expect(screen.getByRole("button", { name: /Xem lại trạm 5: Cổng tuổi mới/ }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("GIFT OPEN")).toBeInTheDocument();
  });
});
