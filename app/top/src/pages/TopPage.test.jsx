import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TopPage from "./TopPage.jsx";

describe("TopPage", () => {
  it("renders links to all existing pages", () => {
    render(<TopPage />);

    const expectedHrefs = [
      "/education/",
      "/education/interview-yosuke/",
      "/education/interview-tomoyo/",
      "/education/interview-ritsu/",
      "/education/mock-interviews/",
      "/education/voice-practice/",
      "/family/profile/",
      "/settings/allowed-emails/",
      "/settings/line-link/",
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

  it("shows section headings", () => {
    render(<TopPage />);
    const headingTexts = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    for (const title of ["教育", "家族", "設定"]) {
      expect(headingTexts).toContain(title);
    }
    for (const removedTitle of ["保育園", "旅行", "住まい", "車", "AI活用"]) {
      expect(headingTexts).not.toContain(removedTitle);
    }
  });
});
