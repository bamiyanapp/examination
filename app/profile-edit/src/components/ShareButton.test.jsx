import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import ShareButton from "./ShareButton.jsx";

describe("ShareButton", () => {
  it("押すとQRコードとURLを表示し、閉じるボタンで閉じる", () => {
    render(<ShareButton />);

    fireEvent.click(screen.getByText("このページを共有"));

    expect(screen.getByText(window.location.href)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(screen.getByText("閉じる"));
    expect(screen.queryByText(window.location.href)).not.toBeInTheDocument();
  });

  it("「URLをコピー」を押すとクリップボードへコピーし表示が変わる", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ShareButton />);
    fireEvent.click(screen.getByText("このページを共有"));
    fireEvent.click(screen.getByText("URLをコピー"));

    expect(writeText).toHaveBeenCalledWith(window.location.href);
    await waitFor(() => expect(screen.getByText("コピーしました")).toBeInTheDocument());
  });

  it("label・getUrlをpropsで指定できる", () => {
    render(<ShareButton label="共有する" getUrl={() => "https://example.com/custom"} />);

    fireEvent.click(screen.getByText("共有する"));

    expect(screen.getByText("https://example.com/custom")).toBeInTheDocument();
  });
});
