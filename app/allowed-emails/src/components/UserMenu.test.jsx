import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import UserMenu from "./UserMenu.jsx";

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("UserMenu", () => {
  it("/_meを取得しユーザー名とアイコンを表示する", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: "taro@example.com", name: "山田太郎", picture: "https://example.com/avatar.png" }),
    });

    render(<UserMenu />);

    await waitFor(() => expect(screen.getByText("山田太郎")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("/_me");
    const image = screen.getByAltText("山田太郎");
    expect(image).toHaveAttribute("src", "https://example.com/avatar.png");
  });

  it("nameが無い場合はemailを表示し、pictureが無い場合はイニシャルを表示する", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: "taro@example.com", name: "", picture: "" }),
    });

    render(<UserMenu />);

    await waitFor(() => expect(screen.getByText("taro@example.com")).toBeInTheDocument());
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  it("ログアウトへのリンクを表示する", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ email: "taro@example.com", name: "山田太郎", picture: "" }),
    });

    render(<UserMenu />);

    await waitFor(() => expect(screen.getByText("ログアウト")).toBeInTheDocument());
    expect(screen.getByText("ログアウト").closest("a")).toHaveAttribute("href", "/_logout");
  });

  it("未ログイン（403）の場合は何も表示しない", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });

    const { container } = render(<UserMenu />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("取得に失敗しても例外を投げない", async () => {
    global.fetch.mockRejectedValueOnce(new Error("network error"));

    expect(() => render(<UserMenu />)).not.toThrow();
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  });
});
