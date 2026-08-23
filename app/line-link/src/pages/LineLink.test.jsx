import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LineLink from "./LineLink.jsx";

describe("LineLink", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("shows a link and QR code to add the LINE official account as a friend (examination#229)", () => {
    render(<LineLink />);

    const link = screen.getByRole("link", { name: "LINE公式アカウントを開く" });
    expect(link).toHaveAttribute("href", "https://line.me/R/ti/p/@206epxcr");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(document.querySelector("svg")).not.toBeNull();
  });

  it("issues a code and shows it as a copyable snippet on success (examination#155)", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "123456" }),
    });

    render(<LineLink />);
    fireEvent.click(screen.getByRole("button", { name: "コードを発行" }));

    await waitFor(() => {
      expect(screen.getByText("123456")).toBeInTheDocument();
    });
    expect(screen.getByText("このコードをLINE botへ送信してください。10分間有効です。")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith("/_link-line", { method: "POST" });
  });

  it("copies the code to the clipboard and shows feedback (examination#155)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "123456" }),
    });

    render(<LineLink />);
    fireEvent.click(screen.getByRole("button", { name: "コードを発行" }));
    await waitFor(() => screen.getByText("123456"));

    fireEvent.click(screen.getByRole("button", { name: "コピー" }));

    expect(writeText).toHaveBeenCalledWith("123456");
    await waitFor(() => expect(screen.getByText("コピーしました")).toBeInTheDocument());
  });

  it("shows an error message on failure", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: "アクセスが許可されていません" }),
    });

    render(<LineLink />);
    fireEvent.click(screen.getByRole("button", { name: "コードを発行" }));

    await waitFor(() => {
      expect(screen.getByText("アクセスが許可されていません")).toBeInTheDocument();
    });
  });
});
