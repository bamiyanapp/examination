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
  window.speechSynthesis = {
    speak: vi.fn(),
    getVoices: vi.fn().mockReturnValue([]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  window.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  global.fetch = vi.fn();
});

// マウント時にプロフィール参照表示用のトークン発行(1)・プロフィール取得(2)が
// 先に走る（examination#125、シチュエーションはexamination#135）ため、
// これをまとめてモックしてから会話開始のテストへ進む
function mockProfileLoad(profile = { situation: "小学校受験の面接", schoolCharacteristics: "", otherContext: "" }) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "profile-token" }) })
    .mockResolvedValueOnce({ ok: true, json: async () => profile });
}

function mockTokenAndOpening(openingReply) {
  global.fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ token: "voice-token" }) })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: openingReply, history: [{ role: "assistant", content: openingReply }] }),
    });
}

describe("VoicePractice", () => {
  it("shows the saved profile (situation / school characteristics / other context) as read-only on mount (examination#125, #135)", async () => {
    mockProfileLoad({ situation: "就職の面接", schoolCharacteristics: "自由な校風", otherContext: "妹がいる4人家族" });

    render(<VoicePractice />);

    await waitFor(() => {
      expect(screen.getByText("シチュエーション: 就職の面接")).toBeInTheDocument();
    });
    expect(screen.getByText("志望先の特色: 自由な校風")).toBeInTheDocument();
    expect(screen.getByText("その他前提情報: 妹がいる4人家族")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/例: 小学校受験の面接/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/自由な校風で、生徒の主体性を重視する/)).not.toBeInTheDocument();
    const editLink = screen.getByRole("link", { name: "プロフィール編集で変更する →" });
    expect(editLink).toHaveAttribute("href", "/settings/profile-edit/");
  });

  it("speaks with a Japanese network voice over a local voice when both are available (examination#158)", async () => {
    const localJaVoice = { lang: "ja-JP", localService: true, name: "端末内蔵" };
    const networkJaVoice = { lang: "ja-JP", localService: false, name: "Google 日本語" };
    window.speechSynthesis.getVoices.mockReturnValue([{ lang: "en-US", localService: false }, localJaVoice, networkJaVoice]);

    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice).toBe(networkJaVoice);
  });

  it("falls back to the first Japanese voice when no network voice is available", async () => {
    const localJaVoice = { lang: "ja-JP", localService: true, name: "端末内蔵" };
    window.speechSynthesis.getVoices.mockReturnValue([localJaVoice]);

    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice).toBe(localJaVoice);
  });

  it("does not set a voice and does not throw when no Japanese voice is available", async () => {
    window.speechSynthesis.getVoices.mockReturnValue([{ lang: "en-US", localService: false }]);

    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => expect(window.speechSynthesis.speak).toHaveBeenCalled());
    const utterance = window.speechSynthesis.speak.mock.calls[0][0];
    expect(utterance.voice).toBeUndefined();
  });

  it("sets the tab title to the situation name instead of a fixed string (examination#157)", async () => {
    mockProfileLoad({ situation: "コンビニ受験面接", schoolCharacteristics: "", otherContext: "" });

    render(<VoicePractice />);

    await waitFor(() => expect(document.title).toBe("コンビニ受験面接 | 小学校受験対策"));
  });

  it("starts a conversation and shows the opening question as a chat bubble, without sending profile fields to the server (examination#135)", async () => {
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText("好きな遊びは何ですか？")).toBeInTheDocument();
    });
    expect(screen.getByText("面接官")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(3, "/_voice-token", { method: "POST" });
    const startCall = global.fetch.mock.calls[3];
    expect(startCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat");
    const sentBody = JSON.parse(startCall[1].body);
    expect(sentBody.role).toBe("本人");
    // シチュエーション・志望先の特色・その他前提情報はサーバー側(voiceChat.js)が
    // プロフィールから直接解決するため、クライアントからは送らない（examination#135）
    expect(sentBody.situation).toBeUndefined();
    expect(sentBody.schoolCharacteristics).toBeUndefined();
    expect(sentBody.otherContext).toBeUndefined();
  });

  it("shows the user's own recognized speech and the AI reply as separate bubbles", async () => {
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: "公園でおにごっこをするのが好きなんですね。誰と遊びますか？",
        history: [],
      }),
    });

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
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    global.fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: "権限がありません" }) });
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText("権限がありません")).toBeInTheDocument();
    });
  });

  it("shows a message when the browser has no speech recognition support", async () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText(/このブラウザは音声認識に対応していません/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "話す" })).toBeDisabled();
  });

  it("ends the practice and shows a saved message when the summary was recorded (examination#93)", async () => {
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: true }) });

    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    fireEvent.click(screen.getByRole("button", { name: "練習を終える" }));

    await waitFor(() => {
      expect(screen.getByText("練習を終了し、今回の振り返りを記録しました。お疲れさまでした。")).toBeInTheDocument();
    });
    const endCall = global.fetch.mock.calls[4];
    expect(endCall[0]).toBe("https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat");
    expect(JSON.parse(endCall[1].body).action).toBe("end");
    expect(screen.getByRole("button", { name: "会話を始める" })).toBeInTheDocument();
  });

  it("ends the practice and shows a plain message when nothing was saved", async () => {
    mockProfileLoad();
    render(<VoicePractice />);
    await waitFor(() => screen.getByRole("link", { name: "プロフィール編集で変更する →" }));

    mockTokenAndOpening("好きな遊びは何ですか？");
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ saved: false }) });

    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    fireEvent.click(screen.getByRole("button", { name: "練習を終える" }));

    await waitFor(() => {
      expect(screen.getByText("練習を終了しました。お疲れさまでした。")).toBeInTheDocument();
    });
  });
});
