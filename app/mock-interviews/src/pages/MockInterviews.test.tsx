import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import MockInterviews from "./MockInterviews.tsx";

const SAMPLE_SUMMARIES = [
  {
    sessionId: "s2",
    role: "father",
    situation: "父親の保護者面接練習",
    schoolCharacteristics: "少人数制で個性を重視",
    channel: "line",
    summary: "・よかった点\n・改善が必要な点\n・次回までのアクション",
    createdAt: "2026-08-02T10:00:00.000Z",
  },
  {
    sessionId: "s1",
    role: "child",
    situation: "本人面接練習",
    schoolCharacteristics: "",
    channel: "voice",
    summary: "・よかった点\n・改善が必要な点\n・次回までのアクション",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
];

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  sessionStorage.clear();
});

function mockTokenAndSummaries(summaries: unknown) {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ summaries }) });
}

describe("MockInterviews", () => {
  it("issues a token and fetches summaries on mount", async () => {
    mockTokenAndSummaries(SAMPLE_SUMMARIES);

    render(<MockInterviews />);

    await waitFor(() => {
      expect(screen.getByText("父親の保護者面接練習")).toBeInTheDocument();
    });
    expect(screen.getByText("本人面接練習")).toBeInTheDocument();
    expect(screen.getByText("少人数制で個性を重視")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, { headers: { Authorization: string } }];
    expect(secondCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/mock-interviews");
    expect(secondCall[1].headers.Authorization).toBe("Bearer voice-token");
  });

  it("shows an empty state when there are no records yet", async () => {
    mockTokenAndSummaries([]);

    render(<MockInterviews />);

    await waitFor(() => {
      expect(screen.getByText("まだ記録がありません。面接練習を行うと、ここに記録が追加されます。")).toBeInTheDocument();
    });
  });

  it("shows an error message when token issuance fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "アクセスが許可されていません" }) });

    render(<MockInterviews />);

    await waitFor(() => {
      expect(screen.getByText("アクセスが許可されていません")).toBeInTheDocument();
    });
  });

  it("shows an error message when fetching summaries fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<MockInterviews />);

    await waitFor(() => {
      expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
    });
  });

  it("shows cached summaries immediately (dimmed) instead of a spinner when a previous fetch was cached (examination#167)", async () => {
    sessionStorage.setItem("examination-mock-interviews-cache", JSON.stringify(SAMPLE_SUMMARIES));
    mockTokenAndSummaries(SAMPLE_SUMMARIES);

    render(<MockInterviews />);

    expect(screen.getByText("父親の保護者面接練習")).toBeInTheDocument();
    expect(screen.getByText("最新の情報を確認しています...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText("最新の情報を確認しています...")).not.toBeInTheDocument();
    });
    expect(screen.getByText("父親の保護者面接練習")).toBeInTheDocument();
  });

  it("keeps showing cached summaries with a non-blocking warning when the background refresh fails (examination#167)", async () => {
    sessionStorage.setItem("examination-mock-interviews-cache", JSON.stringify(SAMPLE_SUMMARIES));
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<MockInterviews />);

    expect(screen.getByText("父親の保護者面接練習")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("最新の情報を取得できませんでした: サーバーエラー")).toBeInTheDocument();
    });
    expect(screen.getByText("父親の保護者面接練習")).toBeInTheDocument();
  });

  it("caches fetched summaries for the next mount (examination#167)", async () => {
    mockTokenAndSummaries(SAMPLE_SUMMARIES);
    render(<MockInterviews />);

    await waitFor(() => screen.getByText("父親の保護者面接練習"));

    expect(JSON.parse(sessionStorage.getItem("examination-mock-interviews-cache")!)).toEqual(SAMPLE_SUMMARIES);
  });
});
