import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AllowedEmails from "./AllowedEmails.jsx";

describe("AllowedEmails", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("loads and renders the email list", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        emails: [{ email: "a@example.com", addedBy: "seed" }],
      }),
    });

    render(<AllowedEmails />);

    await waitFor(() => {
      expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/_admin/emails");
  });

  it("adds an email via the form", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ emails: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emails: [{ email: "new@example.com", addedBy: "me@example.com" }] }),
      });

    render(<AllowedEmails />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByPlaceholderText("追加するメールアドレス"), {
      target: { value: "new@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText(/new@example.com/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenLastCalledWith("/_admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "add", email: "new@example.com" }),
    });
  });

  it("removes an email via the button", async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ emails: [{ email: "a@example.com", addedBy: "seed" }] }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ emails: [] }) });

    render(<AllowedEmails />);
    await waitFor(() => screen.getByText(/a@example.com/));

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    await waitFor(() => {
      expect(screen.queryByText(/a@example.com/)).not.toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenLastCalledWith("/_admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remove", email: "a@example.com" }),
    });
  });

  it("shows an error message when loading fails", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403 });

    render(<AllowedEmails />);

    await waitFor(() => {
      expect(screen.getByText("読み込みに失敗しました（403）")).toBeInTheDocument();
    });
  });
});
