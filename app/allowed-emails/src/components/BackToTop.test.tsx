import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import BackToTop from "./BackToTop.jsx";

describe("BackToTop", () => {
  it("トップページへのリンクを表示する", () => {
    render(<BackToTop />);
    const link = screen.getByRole("link", { name: "← トップに戻る" });
    expect(link).toHaveAttribute("href", "/");
  });
});
