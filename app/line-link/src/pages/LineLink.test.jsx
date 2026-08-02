import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LineLink from "./LineLink.jsx";

describe("LineLink", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("issues a code and shows it on success", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: "123456" }),
    });

    render(<LineLink />);
    fireEvent.click(screen.getByRole("button", { name: "コードを発行" }));

    await waitFor(() => {
      expect(screen.getByText(/コード: 123456/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/_link-line", { method: "POST" });
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
