import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PixelMemoryQuest } from "@/components/birthday/BirthdayExperience";
import { DEFAULT_PIXEL_QUEST } from "@/lib/birthday/dto";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function InteractiveMemoryTrail() {
  return (
    <PixelMemoryQuest
      images={[]}
      pixelQuest={DEFAULT_PIXEL_QUEST}
      recipientName="Mai"
      childCharacter={{
        name: "Bé Mai Mây",
        trait: "Tò mò, thích khám phá",
        archetype: "princess",
      }}
      accent="pear"
      sessionId="session-mai"
      chapterId="44444444-0001-4001-8001-000000000001"
    />
  );
}

describe("pixel memory quest", () => {
  it("uses the default quest for legacy sessions without pixel quest data", () => {
    render(
      <PixelMemoryQuest
        images={[]}
        recipientName="Mai"
        childCharacter={{
          name: "Bé Mai Mây",
          trait: "Tò mò, thích khám phá",
          archetype: "princess",
        }}
        accent="pear"
        sessionId="legacy-session-mai"
        chapterId="legacy-chapter"
      />,
    );

    expect(screen.getByRole("button", { name: /Làng tuổi thơ/ })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Hành trình bắt đầu");
  });

  it("moves through the first checkpoint with keyboard controls", () => {
    render(<InteractiveMemoryTrail />);

    const gameScreen = screen.getByRole("group", {
      name: "Mini game ký ức của Mai. Dùng phím trái phải hoặc A D để di chuyển, phím lên hoặc W để nhảy.",
    });
    const firstGate = screen.getByRole("button", { name: /Làng tuổi thơ/ });

    for (let step = 0; step < 5; step += 1) {
      fireEvent.keyDown(gameScreen, { key: "ArrowRight" });
    }

    expect(firstGate).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đã mở Làng tuổi thơ");
    expect(screen.getByText("MEMORY FOUND")).toBeInTheDocument();
  });

  it("completes all three no-fail checkpoints with the touch controls", () => {
    render(<InteractiveMemoryTrail />);
    const moveRight = screen.getByRole("button", { name: "Đi sang phải" });

    for (let step = 0; step < 18; step += 1) {
      fireEvent.click(moveRight);
    }

    expect(screen.getByRole("button", { name: /Cổng tuổi mới/ }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đã gom đủ 3 mảnh ký ức");
    expect(document.querySelector(".pixel-quest__camera")).toHaveStyle({
      "--camera-x": "-1360px",
    });
    expect(document.querySelector(".pixel-player")).toHaveClass("archetype-princess");
  });

  it("completes through the accessible checkpoint list", () => {
    render(<InteractiveMemoryTrail />);

    fireEvent.click(screen.getByRole("button", { name: /Làng tuổi thơ/ }));
    fireEvent.click(screen.getByRole("button", { name: /Lâu đài ký ức/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cổng tuổi mới/ }));

    expect(screen.getByRole("status")).toHaveTextContent("Đã gom đủ 3 mảnh ký ức");
  });

  it("restores quest progress on the same session and chapter", () => {
    render(<InteractiveMemoryTrail />);
    fireEvent.click(screen.getByRole("button", { name: /Làng tuổi thơ/ }));
    cleanup();

    render(<InteractiveMemoryTrail />);

    expect(screen.getByRole("button", { name: /Làng tuổi thơ/ }))
      .toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Đã mở Làng tuổi thơ");
  });

  it("disables cosmetic jumping when reduced motion is requested", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({
        matches: true,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }),
    });
    render(<InteractiveMemoryTrail />);

    await waitFor(() => {
      expect(document.querySelector(".pixel-quest")).toHaveAttribute(
        "data-reduced-motion",
        "true",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Nhảy" }));

    expect(document.querySelector(".pixel-player")).not.toHaveClass("is-jumping");
  });
});
