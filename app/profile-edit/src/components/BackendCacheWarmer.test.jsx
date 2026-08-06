import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import BackendCacheWarmer from "./BackendCacheWarmer.jsx";

beforeEach(() => {
  sessionStorage.clear();
  global.fetch = vi.fn();
});

describe("BackendCacheWarmer", () => {
  it("トークンを発行しバックエンドの一覧APIをまとめて取得する", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ questions: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summaries: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schoolCharacteristics: "", otherContext: "" }) });

    render(<BackendCacheWarmer />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const urls = global.fetch.mock.calls.slice(1).map((call) => call[0]);
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions");
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews");
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
  });

  it("同一ブラウザセッション内では2回目以降実行しない（examination#69の発行上限に配慮）", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ questions: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summaries: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schoolCharacteristics: "", otherContext: "" }) });

    const { unmount } = render(<BackendCacheWarmer />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    unmount();

    render(<BackendCacheWarmer />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it("トークン発行に失敗しても例外を投げない", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });

    expect(() => render(<BackendCacheWarmer />)).not.toThrow();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  });
});
