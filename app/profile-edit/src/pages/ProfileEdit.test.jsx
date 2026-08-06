import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProfileEdit from "./ProfileEdit.jsx";

beforeEach(() => {
  global.fetch = vi.fn();
});

function mockTokenAndProfile(profile) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => profile });
}

describe("ProfileEdit", () => {
  it("issues a token and loads the saved profile on mount", async () => {
    mockTokenAndProfile({ situation: "就職の面接", schoolCharacteristics: "自由な校風", otherContext: "共働き家庭" });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("就職の面接")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("自由な校風")).toBeInTheDocument();
    expect(screen.getByDisplayValue("共働き家庭")).toBeInTheDocument();

    expect(global.fetch).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
    expect(secondCall[1].headers.Authorization).toBe("Bearer voice-token");
  });

  it("saves edited values via POST and shows a confirmation message", async () => {
    mockTokenAndProfile({ situation: "", schoolCharacteristics: "", otherContext: "" });
    render(<ProfileEdit />);
    await waitFor(() => screen.getByRole("button", { name: "保存する" }));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ situation: "就職の面接", schoolCharacteristics: "自由な校風", otherContext: "共働き家庭" }),
    });

    fireEvent.change(screen.getByPlaceholderText(/例: 小学校受験の面接/), {
      target: { value: "就職の面接" },
    });
    fireEvent.change(screen.getByPlaceholderText("例: 自由な校風で、生徒の主体性を重視する"), {
      target: { value: "自由な校風" },
    });
    fireEvent.change(screen.getByPlaceholderText("例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など"), {
      target: { value: "共働き家庭" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.getByText("保存しました。")).toBeInTheDocument());

    const saveCall = global.fetch.mock.calls[2];
    expect(saveCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
    expect(saveCall[1].method).toBe("POST");
    expect(JSON.parse(saveCall[1].body)).toEqual({
      situation: "就職の面接",
      schoolCharacteristics: "自由な校風",
      otherContext: "共働き家庭",
    });
  });

  it("shows an error message when token issuance fails", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "アクセスが許可されていません" }) });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByText("アクセスが許可されていません")).toBeInTheDocument();
    });
  });

  it("shows an error message when fetching the profile fails", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
    });
  });
});
