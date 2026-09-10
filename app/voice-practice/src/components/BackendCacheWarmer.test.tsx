import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import BackendCacheWarmer from "./BackendCacheWarmer.jsx";

const BACKEND_LIST_ENDPOINTS = [
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions",
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews",
  "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile",
];

async function getAuthToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  if (!res.ok) return undefined;
  const { token } = await res.json();
  return token;
}

function renderWarmer() {
  return render(
    <BackendCacheWarmer
      endpoints={BACKEND_LIST_ENDPOINTS}
      getAuthToken={getAuthToken}
      warmedFlagKey="examination-backend-cache-warmed"
    />
  );
}

let fetchMock: Mock;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("BackendCacheWarmer", () => {
  it("トークンを発行しバックエンドの一覧APIをまとめて取得する", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ questions: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summaries: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schoolCharacteristics: "", otherContext: "" }) });

    renderWarmer();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const urls = fetchMock.mock.calls.slice(1).map((call) => call[0]);
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/interview-questions");
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews");
    expect(urls).toContain("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
  });

  it("同一ブラウザセッション内では2回目以降実行しない（examination#69の発行上限に配慮）", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ questions: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ summaries: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ schoolCharacteristics: "", otherContext: "" }) });

    const { unmount } = renderWarmer();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    unmount();

    renderWarmer();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("トークン発行に失敗しても例外を投げない", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    expect(() => renderWarmer()).not.toThrow();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
