import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AllowedEmails from "./AllowedEmails.jsx";

// /_admin/emailsへの応答はテストごとにこのキューへ順番に積む。/_meはmeResponseで
// 個別に差し替える（マウント時に1回だけ呼ばれ、以後の/_admin/emailsへの呼び出しとは
// 独立しているため、専用の変数で管理する方がテストの見通しが良い）
let adminEmailsResponses;
let meResponse;

beforeEach(() => {
  adminEmailsResponses = [];
  meResponse = { ok: false };
  global.fetch = vi.fn((url) => {
    if (url === "/_me") return Promise.resolve(meResponse);
    return Promise.resolve(adminEmailsResponses.shift());
  });
});

describe("AllowedEmails", () => {
  it("loads and renders the email list", async () => {
    adminEmailsResponses.push({
      ok: true,
      json: async () => ({ emails: [{ email: "a@example.com", addedBy: "seed" }] }),
    });

    render(<AllowedEmails />);

    await waitFor(() => {
      expect(screen.getByText(/a@example.com/)).toBeInTheDocument();
    });
    expect(global.fetch).toHaveBeenCalledWith("/_admin/emails");
  });

  it("adds an email via the form", async () => {
    adminEmailsResponses.push(
      { ok: true, json: async () => ({ emails: [] }) },
      { ok: true, json: async () => ({ emails: [{ email: "new@example.com", addedBy: "me@example.com" }] }) }
    );

    render(<AllowedEmails />);
    await waitFor(() => expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument());

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

  it("shows the server error when adding an email already in another family (examination#243)", async () => {
    adminEmailsResponses.push(
      { ok: true, json: async () => ({ emails: [] }) },
      {
        ok: false,
        status: 400,
        json: async () => ({ error: "そのメールアドレスは既に何らかの家族に所属しています" }),
      }
    );

    render(<AllowedEmails />);
    await waitFor(() => expect(screen.queryByText(/読み込み中/)).not.toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("追加するメールアドレス"), {
      target: { value: "other-family@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    await waitFor(() => {
      expect(screen.getByText("そのメールアドレスは既に何らかの家族に所属しています")).toBeInTheDocument();
    });
  });

  it("removes another member's email via the button", async () => {
    meResponse = { ok: true, json: async () => ({ email: "me@example.com" }) };
    adminEmailsResponses.push(
      {
        ok: true,
        json: async () => ({
          emails: [
            { email: "a@example.com", addedBy: "seed" },
            { email: "me@example.com", addedBy: "seed" },
          ],
        }),
      },
      { ok: true, json: async () => ({ emails: [{ email: "me@example.com", addedBy: "seed" }] }) }
    );

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
    adminEmailsResponses.push({ ok: false, status: 403 });

    render(<AllowedEmails />);

    await waitFor(() => {
      expect(screen.getByText("読み込みに失敗しました（403）")).toBeInTheDocument();
    });
  });

  describe("自分自身の退会（examination#284）", () => {
    it("disables the self-delete button when other members remain", async () => {
      meResponse = { ok: true, json: async () => ({ email: "me@example.com" }) };
      adminEmailsResponses.push({
        ok: true,
        json: async () => ({
          emails: [
            { email: "me@example.com", addedBy: "seed" },
            { email: "other@example.com", addedBy: "seed" },
          ],
        }),
      });

      render(<AllowedEmails />);
      await waitFor(() => screen.getByText(/me@example.com/));

      const selfDeleteButton = screen.getByRole("button", { name: "退会して家族データを削除する" });
      expect(selfDeleteButton).toBeDisabled();
    });

    it("shows a warning confirm and, once accepted, removes the last member and signs out (examination#284)", async () => {
      meResponse = { ok: true, json: async () => ({ email: "me@example.com" }) };
      adminEmailsResponses.push(
        { ok: true, json: async () => ({ emails: [{ email: "me@example.com", addedBy: "seed" }] }) },
        { ok: true, json: async () => ({ emails: [], familyDeleted: true }) }
      );
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      delete window.location;
      window.location = { href: "" };

      render(<AllowedEmails />);
      await waitFor(() => screen.getByText(/me@example.com/));

      const selfDeleteButton = screen.getByRole("button", { name: "退会して家族データを削除する" });
      expect(selfDeleteButton).not.toBeDisabled();
      fireEvent.click(selfDeleteButton);

      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => {
        expect(window.location.href).toBe("/_logout");
      });
      expect(global.fetch).toHaveBeenLastCalledWith("/_admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", email: "me@example.com" }),
      });
    });

    it("does not call the API when the warning confirm is dismissed", async () => {
      meResponse = { ok: true, json: async () => ({ email: "me@example.com" }) };
      adminEmailsResponses.push({
        ok: true,
        json: async () => ({ emails: [{ email: "me@example.com", addedBy: "seed" }] }),
      });
      vi.spyOn(window, "confirm").mockReturnValue(false);

      render(<AllowedEmails />);
      await waitFor(() => screen.getByText(/me@example.com/));

      fireEvent.click(screen.getByRole("button", { name: "退会して家族データを削除する" }));

      expect(global.fetch).toHaveBeenCalledTimes(2); // 初期読み込み(/_admin/emails・/_me)のみ
    });
  });
});
