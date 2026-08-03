import { useRef, useState } from "react";
import { useWhisper } from "../stt/useWhisper.js";
import { usePiperTts } from "../tts/usePiperTts.js";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（Job Summaryの「LINE bot Webhook URL」と同じAPI）
const VOICE_CHAT_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat";

const DEFAULT_SITUATION = "小学校受験の面接";

function getMicrophoneCtor() {
  if (typeof navigator === "undefined") return undefined;
  return navigator.mediaDevices?.getUserMedia ? navigator.mediaDevices : undefined;
}

// 音声対話ページ（examination#62）。チャット風UIでユーザー自身の発言も画面に表示し、
// シチュエーション・志望先の特色を自由入力できるようにして汎用的な受験・面接練習
// アプリへ拡張した（examination#76）。音声認識・音声合成は当初ブラウザ標準API
// （SpeechRecognition/SpeechSynthesis）を使っていたが、ブラウザ依存の低減・認識精度
// 向上のため、ONNX Runtime Web（kotoba-whisper）+ Piper（ブラウザ内実行）へ
// 置き換えた（examination#73）
export default function VoicePractice() {
  const [role, setRole] = useState("本人");
  const [situation, setSituation] = useState(DEFAULT_SITUATION);
  const [schoolCharacteristics, setSchoolCharacteristics] = useState("");
  const [otherContext, setOtherContext] = useState("");
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("");
  const [isError, setIsError] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const voiceTokenRef = useRef(null);
  const historyRef = useRef([]);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);

  const mediaDevices = getMicrophoneCtor();
  const { transcribe, modelStatus: sttStatus, downloadProgress: sttProgress } = useWhisper();
  const { speak, prepare: prepareTts, modelStatus: ttsStatus, downloadProgress: ttsProgress } = usePiperTts();

  async function issueVoiceToken() {
    const res = await fetch("/_voice-token", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `トークンの発行に失敗しました（${res.status}）`);
    }
    voiceTokenRef.current = data.token;
  }

  async function sendToVoiceChat(message) {
    const res = await fetch(VOICE_CHAT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${voiceTokenRef.current}` },
      body: JSON.stringify({
        role,
        situation,
        schoolCharacteristics,
        otherContext,
        history: historyRef.current,
        message: message || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `AI応答の取得に失敗しました（${res.status}）`);
    }
    return data;
  }

  async function speakSafely(text) {
    try {
      await speak(text);
    } catch (error) {
      console.error("TTS failed", error);
    }
  }

  async function handleStart() {
    setIsError(false);
    setMessages([]);
    historyRef.current = [];
    setIsBusy(true);
    setStatus("モデルを準備し、会話を開始しています...（初回は音声モデルのダウンロードのため時間がかかります）");
    try {
      await Promise.all([issueVoiceToken(), prepareTts()]);
      const data = await sendToVoiceChat(null);
      historyRef.current = data.history;
      setMessages([{ speaker: "面接官", text: data.reply }]);
      setStarted(true);
      if (!mediaDevices) {
        setIsError(true);
        setStatus("このブラウザ・端末はマイクに対応していません。");
      } else {
        setStatus("");
      }
      await speakSafely(data.reply);
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleStartRecording() {
    if (!mediaDevices) return;
    setIsError(false);
    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setStatus("録音中...話し終わったら「話し終わった」を押してください");
    } catch (error) {
      setIsError(true);
      setStatus(`マイクを使用できませんでした（${error.message}）`);
    }
  }

  async function handleStopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    setIsRecording(false);
    setStatus("音声を認識しています...");

    const audioUrl = await new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        resolve(URL.createObjectURL(blob));
      };
      recorder.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    });

    try {
      const said = (await transcribe(audioUrl)).trim();
      URL.revokeObjectURL(audioUrl);
      if (!said) {
        setIsError(true);
        setStatus("音声を認識できませんでした。もう一度お試しください。");
        return;
      }
      setMessages((prev) => [...prev, { speaker: "あなた", text: said }]);
      setStatus("AIが応答を考えています...");
      const data = await sendToVoiceChat(said);
      historyRef.current = data.history;
      setMessages((prev) => [...prev, { speaker: "面接官", text: data.reply }]);
      setStatus("");
      await speakSafely(data.reply);
    } catch (error) {
      URL.revokeObjectURL(audioUrl);
      setIsError(true);
      setStatus(error.message);
    }
  }

  async function handleEnd() {
    setIsBusy(true);
    try {
      const res = await fetch(VOICE_CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${voiceTokenRef.current}` },
        body: JSON.stringify({ role, situation, schoolCharacteristics, history: historyRef.current, action: "end" }),
      });
      const data = await res.json();
      setIsError(false);
      setStatus(data.saved ? "練習を終了し、今回の振り返りを記録しました。お疲れさまでした。" : "練習を終了しました。お疲れさまでした。");
    } catch (error) {
      console.error("Failed to save mock interview summary", error);
      setIsError(false);
      setStatus("練習を終了しました。お疲れさまでした。");
    } finally {
      setStarted(false);
      setIsBusy(false);
    }
  }

  const modelLoadingText =
    sttStatus === "loading"
      ? `音声認識モデルを読み込み中...（${sttProgress}%）`
      : ttsStatus === "loading"
        ? `音声合成モデルを読み込み中...（${ttsProgress}%）`
        : "";

  return (
    <main>
      <h1>音声で面接練習</h1>
      <p>
        声に出しながら面接練習ができます。マイクとスピーカーが使えるスマートフォン・PCのブラウザで利用してください。
      </p>
      <ul>
        <li>音声認識・音声合成はブラウザ内で動作するAIモデル（kotoba-whisper・Piper）を使用します。初回利用時にモデルのダウンロードが発生します</li>
        <li>録音は手動操作です。話し終わったらボタンを押して送信してください</li>
        <li>LINE botの面接練習とは別の、ブラウザだけで完結する会話形式の練習です</li>
      </ul>

      {!started ? (
        <div>
          <label>
            ロール:
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="本人">本人</option>
              <option value="父">父</option>
              <option value="母">母</option>
            </select>
          </label>
          <label>
            シチュエーション:
            <input
              type="text"
              value={situation}
              onChange={(event) => setSituation(event.target.value)}
              placeholder="例: 小学校受験の面接、就職の面接、大学入試の面接"
            />
          </label>
          <label>
            志望先の特色（任意）:
            <textarea
              value={schoolCharacteristics}
              onChange={(event) => setSchoolCharacteristics(event.target.value)}
              placeholder="例: 自由な校風で、生徒の主体性を重視する"
              rows={3}
            />
          </label>
          <label>
            その他前提情報（任意）:
            <textarea
              value={otherContext}
              onChange={(event) => setOtherContext(event.target.value)}
              placeholder="例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など"
              rows={3}
            />
          </label>
          <button type="button" onClick={handleStart} disabled={isBusy}>
            会話を始める
          </button>
        </div>
      ) : (
        <div>
          <div className="chat">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`bubble ${message.speaker === "あなた" ? "user" : "assistant"}`}
              >
                <span className="speaker">{message.speaker}</span>
                <p>{message.text}</p>
              </div>
            ))}
          </div>
          {!isRecording ? (
            <button type="button" onClick={handleStartRecording} disabled={!mediaDevices || isBusy}>
              話す
            </button>
          ) : (
            <button type="button" onClick={handleStopRecording}>
              話し終わった
            </button>
          )}
          <button type="button" onClick={handleEnd} disabled={isRecording || isBusy}>
            練習を終える
          </button>
        </div>
      )}

      {modelLoadingText && <p>{modelLoadingText}</p>}
      <p style={{ color: isError ? "crimson" : undefined }}>{status}</p>
    </main>
  );
}
