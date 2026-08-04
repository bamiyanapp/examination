import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VoicePractice from "./VoicePractice.jsx";

class FakeSpeechRecognition {
  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
}
FakeSpeechRecognition.instances = [];

beforeEach(() => {
  FakeSpeechRecognition.instances = [];
  window.SpeechRecognition = FakeSpeechRecognition;
  window.speechSynthesis = { speak: vi.fn() };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  global.fetch = vi.fn();
});

function mockTokenAndOpening(openingReply) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: openingReply, history: [{ role: "assistant", content: openingReply }] }),
    });
}

describe("VoicePractice", () => {
  it("starts a conversation and shows the opening question as a chat bubble", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText("好きな遊びは何ですか？")).toBeInTheDocument();
    });
    expect(screen.getByText("面接官")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(1, "/_voice-token", { method: "POST" });
    const secondCall = global.fetch.mock.calls[1];
    expect(secondCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat");
    const sentBody = JSON.parse(secondCall[1].body);
    expect(sentBody.situation).toBe("小学校受験の面接");
    expect(sentBody.role).toBe("本人");
  });

  it("sends the custom situation and school characteristics when starting", async () => {
    mockTokenAndOpening("自己PRをお願いします。");

    render(<VoicePractice />);
    fireEvent.change(screen.getByPlaceholderText(/例: 小学校受験の面接/), {
      target: { value: "就職の面接" },
    });
    fireEvent.change(screen.getByPlaceholderText(/自由な校風/), {
      target: { value: "チームワークを重視する社風" },
    });
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => screen.getByText("自己PRをお願いします。"));
    const sentBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(sentBody.situation).toBe("就職の面接");
    expect(sentBody.schoolCharacteristics).toBe("チームワークを重視する社風");
  });

  it("sends the other context field when starting (examination#76)", async () => {
    mockTokenAndOpening("自己PRをお願いします。");

    render(<VoicePractice />);
    fireEvent.change(screen.getByPlaceholderText(/志望先の特色欄では書ききれない/), {
      target: { value: "妹がいる4人家族" },
    });
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => screen.getByText("自己PRをお願いします。"));
    const sentBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(sentBody.otherContext).toBe("妹がいる4人家族");
  });

  it("shows the user's own recognized speech and the AI reply as separate bubbles", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "公園でおにごっこをするのが好きなんですね。誰と遊びますか？",
        history: [],
      }),
    });

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    fireEvent.click(screen.getByRole("button", { name: "話す" }));
    const recognition = FakeSpeechRecognition.instances[0];
    recognition.onresult({ results: [[{ transcript: "公園でおにごっこをします" }]] });

    await waitFor(() => {
      expect(screen.getByText("公園でおにごっこをします")).toBeInTheDocument();
      expect(screen.getByText("公園でおにごっこをするのが好きなんですね。誰と遊びますか？")).toBeInTheDocument();
    });
    expect(screen.getAllByText("あなた")).toHaveLength(1);
    expect(screen.getAllByText("面接官")).toHaveLength(2);
  });

  it("shows an error message when token issuance fails", async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "権限がありません" }) });

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText("権限がありません")).toBeInTheDocument();
    });
  });

  it("shows a message when the browser has no speech recognition support", async () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    mockTokenAndOpening("好きな遊びは何ですか？");

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText(/このブラウザは音声認識に対応していません/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "話す" })).toBeDisabled();
  });

  it("ends the practice and shows a saved message when the summary was recorded (examination#93)", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    fireEvent.click(screen.getByRole("button", { name: "練習を終える" }));

    await waitFor(() => {
      expect(screen.getByText("練習を終了し、今回の振り返りを記録しました。お疲れさまでした。")).toBeInTheDocument();
    });
    const endCall = global.fetch.mock.calls[2];
    expect(endCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat");
    expect(JSON.parse(endCall[1].body).action).toBe("end");
    expect(screen.getByRole("button", { name: "会話を始める" })).toBeInTheDocument();
  });

  it("ends the practice and shows a plain message when nothing was saved", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: false }) });

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    fireEvent.click(screen.getByRole("button", { name: "練習を終える" }));

    await waitFor(() => {
      expect(screen.getByText("練習を終了しました。お疲れさまでした。")).toBeInTheDocument();
    });
  });
});
