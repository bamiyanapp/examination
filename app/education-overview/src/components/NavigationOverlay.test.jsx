import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import NavigationOverlay from "./NavigationOverlay.jsx";

describe("NavigationOverlay", () => {
  it("内部リンクのクリックでオーバーレイを表示する", () => {
    const { container } = render(
      <>
        <NavigationOverlay />
        <a href="/">トップへ</a>
      </>,
    );
    const overlay = container.querySelector("#nav-overlay");
    expect(overlay.classList.contains("visible")).toBe(false);

    fireEvent.click(container.querySelector("a"));

    expect(overlay.classList.contains("visible")).toBe(true);
  });

  it("target=_blankのリンクではオーバーレイを表示しない", () => {
    const { container } = render(
      <>
        <NavigationOverlay />
        <a href="/" target="_blank" rel="noreferrer">
          別タブで開く
        </a>
      </>,
    );
    const overlay = container.querySelector("#nav-overlay");

    fireEvent.click(container.querySelector("a"));

    expect(overlay.classList.contains("visible")).toBe(false);
  });

  it("外部リンク（httpから始まるhref）ではオーバーレイを表示しない", () => {
    const { container } = render(
      <>
        <NavigationOverlay />
        <a href="https://example.com">外部サイト</a>
      </>,
    );
    const overlay = container.querySelector("#nav-overlay");

    fireEvent.click(container.querySelector("a"));

    expect(overlay.classList.contains("visible")).toBe(false);
  });
});
