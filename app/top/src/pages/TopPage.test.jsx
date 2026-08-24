import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import TopPage from "./TopPage.jsx";

beforeEach(() => {
  // /_meが家族名を返さない既定の応答にしておく（examination#285）。個別のテストで
  // 上書きしない限り、他の既存テストは見出しへの影響を気にせず書けるようにする
  global.fetch = vi.fn().mockResolvedValue({ ok: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TopPage", () => {
  it("renders links to all existing pages", () => {
    render(<TopPage />);

    const expectedHrefs = [
      "/education/",
      "/education/interview-questions/",
      "/education/mock-interviews/",
      "/education/voice-practice/",
      "/settings/allowed-emails/",
      "/settings/line-link/",
      "/settings/profile-edit/",
    ];

    for (const href of expectedHrefs) {
      const link = document.querySelector(`a[href="${href}"]`);
      expect(link, `expected a link to ${href}`).not.toBeNull();
    }
  });

  it("does not link to the removed sections (保育園・旅行・住まい・車・AI活用)", () => {
    render(<TopPage />);
    for (const href of ["/childcare/", "/travel/", "/home/", "/cars/", "/ai/"]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull();
    }
  });

  it("does not link to the old per-person interview pages (examination#77で1画面へ統合)", () => {
    render(<TopPage />);
    for (const href of ["/education/interview-yosuke/", "/education/interview-tomoyo/", "/education/interview-ritsu/"]) {
      expect(document.querySelector(`a[href="${href}"]`)).toBeNull();
    }
  });

  it("shows section headings", () => {
    render(<TopPage />);
    const headingTexts = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    for (const title of ["教育", "設定"]) {
      expect(headingTexts).toContain(title);
    }
    for (const removedTitle of ["保育園", "旅行", "住まい", "車", "AI活用", "家族"]) {
      expect(headingTexts).not.toContain(removedTitle);
    }
  });

  it("does not link to the removed family profile page (examination#102)", () => {
    render(<TopPage />);
    expect(document.querySelector('a[href="/family/profile/"]')).toBeNull();
  });

  it("shows the school-crossing illustration (examination#210)", () => {
    render(<TopPage />);
    expect(document.querySelector('img[src="/favicon.png"]')).not.toBeNull();
  });

  it("shows the semantic version, build SHA and formatted build time when set (examination#131, #137)", () => {
    vi.stubEnv("VITE_BUILD_VERSION", "v1.4.2");
    vi.stubEnv("VITE_BUILD_SHA", "abc1234");
    vi.stubEnv("VITE_BUILD_TIME", "2026-08-06T03:04:00Z");
    render(<TopPage />);
    expect(screen.getByText(/バージョン: v1\.4\.2/)).toBeInTheDocument();
    expect(screen.getByText(/abc1234/)).toBeInTheDocument();
  });

  it("falls back to a placeholder when build info is not set (e.g. local dev, examination#131)", () => {
    vi.stubEnv("VITE_BUILD_VERSION", "");
    vi.stubEnv("VITE_BUILD_SHA", "");
    vi.stubEnv("VITE_BUILD_TIME", "");
    render(<TopPage />);
    expect(screen.getByText("バージョン: 開発版")).toBeInTheDocument();
  });

  it("shows a heading of {家族名}の試験対策 when /_me returns a family name (examination#285)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ familyName: "調布の鈴木家" }) });
    render(<TopPage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("調布の鈴木家の試験対策");
    });
    expect(document.title).toBe("調布の鈴木家の試験対策");
  });

  it("falls back to the default heading when /_me has no family name (examination#285)", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ familyName: "" }) });
    render(<TopPage />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/_me"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("小学校受験対策");
  });

  it("falls back to the default heading when /_me fails (examination#285)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network error"));
    render(<TopPage />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/_me"));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("小学校受験対策");
  });
});
