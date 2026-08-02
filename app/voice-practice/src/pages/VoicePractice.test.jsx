import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import VoicePractice from "./VoicePractice.jsx";

const mockTranscribe = vi.fn();
const mockSpeak = vi.fn().mockResolvedValue(undefined);
const mockPrepare = vi.fn().mockResolvedValue(undefined);

vi.mock("../stt/useWhisper.js", () => ({
  useWhisper: () => ({ transcribe: mockTranscribe, modelStatus: "ready", downloadProgress: 100 }),
}));
vi.mock("../tts/usePiperTts.js", () => ({
  usePiperTts: () => ({ speak: mockSpeak, prepare: mockPrepare, modelStatus: "ready", downloadProgress: 100 }),
}));

// jsdomにはMediaRecorder/getUserMediaが無いため、録音の開始・終了のみを
// シミュレートする最小限のフェイクを用意する（音声認識・合成自体は上記でモック済み）
class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.mimeType = "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }
  start() {}
  stop() {
    this.onstop?.();
  }
}
FakeMediaRecorder.instances = [];

beforeEach(() => {
  FakeMediaRecorder.instances = [];
  mockTranscribe.mockReset();
  mockSpeak.mockClear();
  mockPrepare.mockClear();
  global.MediaRecorder = FakeMediaRecorder;
  Object.defineProperty(global.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();
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
    expect(mockPrepare).toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalledWith("好きな遊びは何ですか？");
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

  it("records, transcribes with Whisper, and shows the user's speech and the AI reply as separate bubbles", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");
    mockTranscribe.mockResolvedValue("公園でおにごっこをします");
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
    await waitFor(() => expect(FakeMediaRecorder.instances).toHaveLength(1));
    await screen.findByRole("button", { name: "話し終わった" });

    fireEvent.click(screen.getByRole("button", { name: "話し終わった" }));

    await waitFor(() => {
      expect(screen.getByText("公園でおにごっこをします")).toBeInTheDocument();
      expect(screen.getByText("公園でおにごっこをするのが好きなんですね。誰と遊びますか？")).toBeInTheDocument();
    });
    expect(mockTranscribe).toHaveBeenCalledWith("blob:fake-url");
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

  it("shows an error message when the microphone cannot be accessed", async () => {
    mockTokenAndOpening("好きな遊びは何ですか？");
    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));
    await waitFor(() => screen.getByText("好きな遊びは何ですか？"));

    global.navigator.mediaDevices.getUserMedia.mockRejectedValueOnce(new Error("permission denied"));
    fireEvent.click(screen.getByRole("button", { name: "話す" }));

    await waitFor(() => {
      expect(screen.getByText(/マイクを使用できませんでした/)).toBeInTheDocument();
    });
  });

  it("shows a message when the browser has no microphone support", async () => {
    Object.defineProperty(global.navigator, "mediaDevices", { configurable: true, value: undefined });
    mockTokenAndOpening("好きな遊びは何ですか？");

    render(<VoicePractice />);
    fireEvent.click(screen.getByRole("button", { name: "会話を始める" }));

    await waitFor(() => {
      expect(screen.getByText(/マイクに対応していません/)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "話す" })).toBeDisabled();
  });
});
