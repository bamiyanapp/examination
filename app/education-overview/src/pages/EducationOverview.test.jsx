import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EducationOverview from "./EducationOverview.jsx";

describe("EducationOverview", () => {
  it("renders links to the education section pages", () => {
    render(<EducationOverview />);

    for (const href of ["/education/interview-questions/", "/education/mock-interviews/", "/education/voice-practice/"]) {
      const link = document.querySelector(`a[href="${href}"]`);
      expect(link, `expected a link to ${href}`).not.toBeNull();
    }
  });

  it("does not contain family-specific information (examination#92)", () => {
    render(<EducationOverview />);
    const bodyText = document.body.textContent;

    for (const familySpecificWord of ["よーすけ", "ともよ", "りつ", "今年度", "家族構成"]) {
      expect(bodyText).not.toContain(familySpecificWord);
    }
    expect(document.querySelector('a[href="../family/profile.md"]')).toBeNull();
  });

  it("shows the generic workflow and mock interview methodology", () => {
    render(<EducationOverview />);
    expect(screen.getByText("運用フロー")).toBeInTheDocument();
    expect(screen.getByText("模擬面接の進め方（Claude Codeとの実施時）")).toBeInTheDocument();
    expect(screen.getByText(/記録を残す場合は対応するIssueを起票してから追記する/)).toBeInTheDocument();
  });
});
