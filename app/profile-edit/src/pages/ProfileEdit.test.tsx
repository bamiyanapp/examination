import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProfileEdit from "./ProfileEdit.tsx";

let fetchMock: Mock;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function mockTokenAndProfile(profile: unknown) {
  fetchMock
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => profile });
}

describe("ProfileEdit", () => {
  it("issues a token and loads the saved profile on mount", async () => {
    mockTokenAndProfile({
      situation: "就職の面接",
      schoolCharacteristics: "自由な校風",
      otherContext: "共働き家庭",
      childName: "山田太郎",
      fatherName: "山田一郎",
      motherName: "山田花子",
    });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("就職の面接")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("自由な校風")).toBeInTheDocument();
    expect(screen.getByDisplayValue("共働き家庭")).toBeInTheDocument();
    expect(screen.getByDisplayValue("山田太郎")).toBeInTheDocument();
    expect(screen.getByDisplayValue("山田一郎")).toBeInTheDocument();
    expect(screen.getByDisplayValue("山田花子")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, { headers: { Authorization: string } }];
    expect(secondCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
    expect(secondCall[1].headers.Authorization).toBe("Bearer voice-token");
  });

  it("saves edited values via POST and shows a confirmation message", async () => {
    mockTokenAndProfile({ situation: "", schoolCharacteristics: "", otherContext: "" });
    render(<ProfileEdit />);
    await waitFor(() => screen.getByRole("button", { name: "保存する" }));

    fetchMock.mockResolvedValueOnce({
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
    fireEvent.change(screen.getByPlaceholderText("例: 山田太郎"), { target: { value: "山田太郎" } });
    fireEvent.change(screen.getByPlaceholderText("例: 山田一郎"), { target: { value: "山田一郎" } });
    fireEvent.change(screen.getByPlaceholderText("例: 山田花子"), { target: { value: "山田花子" } });
    fireEvent.click(screen.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(screen.getByText("保存しました。")).toBeInTheDocument());

    const saveCall = fetchMock.mock.calls[2] as unknown as [string, { method: string; body: string }];
    expect(saveCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile");
    expect(saveCall[1].method).toBe("POST");
    expect(JSON.parse(saveCall[1].body)).toEqual({
      situation: "就職の面接",
      schoolCharacteristics: "自由な校風",
      otherContext: "共働き家庭",
      childName: "山田太郎",
      fatherName: "山田一郎",
      motherName: "山田花子",
    });
  });

  it("shows an error message when token issuance fails", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "アクセスが許可されていません" }) });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByText("アクセスが許可されていません")).toBeInTheDocument();
    });
  });

  it("shows an error message when fetching the profile fails", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "サーバーエラー" }) });

    render(<ProfileEdit />);

    await waitFor(() => {
      expect(screen.getByText("サーバーエラー")).toBeInTheDocument();
    });
  });

  it("resizes the schoolCharacteristics textarea to fit its content on input (examination#194)", async () => {
    mockTokenAndProfile({ situation: "", schoolCharacteristics: "", otherContext: "" });
    render(<ProfileEdit />);
    const textarea = await screen.findByPlaceholderText("例: 自由な校風で、生徒の主体性を重視する");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 120 });

    fireEvent.input(textarea, { target: { value: "1行目\n2行目\n3行目" } });

    expect(textarea.style.height).toBe("120px");
  });

  it("resizes the otherContext textarea to fit its content on input (examination#194)", async () => {
    mockTokenAndProfile({ situation: "", schoolCharacteristics: "", otherContext: "" });
    render(<ProfileEdit />);
    const textarea = await screen.findByPlaceholderText("例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など");
    Object.defineProperty(textarea, "scrollHeight", { configurable: true, value: 150 });

    fireEvent.input(textarea, { target: { value: "1行目\n2行目\n3行目\n4行目" } });

    expect(textarea.style.height).toBe("150px");
  });
});
