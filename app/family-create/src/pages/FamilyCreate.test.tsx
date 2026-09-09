import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FamilyCreate from "./FamilyCreate.tsx";

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

describe("FamilyCreate", () => {
  it("submits the entered situation and shows a success message with a link home", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slug: "abc123", situation: "小学校受験の面接" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 小学校受験の面接"), { target: { value: "小学校受験の面接" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText(/小学校受験の面接」を作成しました/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/_families", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation: "小学校受験の面接" }),
    });
    expect(screen.getByRole("link", { name: "トップページへ進む" })).toHaveAttribute("href", "/");
  });

  it("shows a reassuring info message (not an error) when already registered, with a link home (examination#267)", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "既に家族に所属しています" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 小学校受験の面接"), { target: { value: "コンビニ受験の面接" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText(/既に家族に参加済みです/)).toBeInTheDocument();
    });
    expect(screen.queryByText("既に家族に所属しています")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "トップページへ進む" })).toHaveAttribute("href", "/");
  });

  it("shows the server error message for other rejections", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "サーバーエラーが発生しました" }),
    });

    render(<FamilyCreate />);
    fireEvent.change(screen.getByPlaceholderText("例: 小学校受験の面接"), { target: { value: "中学受験の面接" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText("サーバーエラーが発生しました")).toBeInTheDocument();
    });
  });
});
