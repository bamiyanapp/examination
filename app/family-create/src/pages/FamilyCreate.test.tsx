import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FamilyCreate from "./FamilyCreate.tsx";

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function mockLoggedIn() {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ email: "family@example.com" }) });
}

describe("FamilyCreate", () => {
  it("submits the entered situation and shows a success message with a link home", async () => {
    mockLoggedIn();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ slug: "abc123", situation: "小学校受験の面接" }),
    });

    render(<FamilyCreate />);
    await screen.findByPlaceholderText("例: 小学校受験の面接");
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
    mockLoggedIn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: "既に家族に所属しています" }),
    });

    render(<FamilyCreate />);
    await screen.findByPlaceholderText("例: 小学校受験の面接");
    fireEvent.change(screen.getByPlaceholderText("例: 小学校受験の面接"), { target: { value: "コンビニ受験の面接" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText(/既に家族に参加済みです/)).toBeInTheDocument();
    });
    expect(screen.queryByText("既に家族に所属しています")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "トップページへ進む" })).toHaveAttribute("href", "/");
  });

  it("shows the server error message for other rejections", async () => {
    mockLoggedIn();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "サーバーエラーが発生しました" }),
    });

    render(<FamilyCreate />);
    await screen.findByPlaceholderText("例: 小学校受験の面接");
    fireEvent.change(screen.getByPlaceholderText("例: 小学校受験の面接"), { target: { value: "中学受験の面接" } });
    fireEvent.click(screen.getByRole("button", { name: "作成する" }));

    await waitFor(() => {
      expect(screen.getByText("サーバーエラーが発生しました")).toBeInTheDocument();
    });
  });

  it("shows a login prompt instead of the form when not logged in (examination#437)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 });

    render(<FamilyCreate />);

    await waitFor(() => {
      expect(screen.getByText("ログイン")).toBeInTheDocument();
    });
    expect(screen.getByText("ログイン").closest("a")).toHaveAttribute("href", "/_login?redirect=/family-create/");
    expect(screen.queryByPlaceholderText("例: 小学校受験の面接")).not.toBeInTheDocument();
  });

  it("treats a failed /_me fetch as not logged in without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));

    expect(() => render(<FamilyCreate />)).not.toThrow();

    await waitFor(() => {
      expect(screen.getByText("ログイン")).toBeInTheDocument();
    });
  });
});
