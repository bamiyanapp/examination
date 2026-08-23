import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FamilyCreate from "./FamilyCreate.jsx";

beforeEach(() => {
  global.fetch = vi.fn();
});

describe("FamilyCreate", () => {
  it("submits the entered name and shows a success message with a link home", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slug: "abc123", name: "調布の鈴木家" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 調布の鈴木家"), { target: { value: "調布の鈴木家" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText(/調布の鈴木家」を作成しました/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/_families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "調布の鈴木家" }),
    });
    expect(screen.getByRole("link", { name: "トップページへ進む" })).toHaveAttribute("href", "/");
  });

  it("shows a reassuring info message (not an error) when already registered, with a link home (examination#267)", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "既に家族に所属しています" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 調布の鈴木家"), { target: { value: "誰かの家族" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText(/既に家族に参加済みです/)).toBeInTheDocument();
    });
    expect(screen.queryByText("既に家族に所属しています")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "トップページへ進む" })).toHaveAttribute("href", "/");
  });

  it("shows the server error message for other rejections such as a duplicate family name", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: "その家族名は既に使われています" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 調布の鈴木家"), { target: { value: "調布の鈴木家" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText("その家族名は既に使われています")).toBeInTheDocument();
    });
  });
});
