import { useRef, useState } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（Job Summaryの「LINE bot Webhook URL」と同じAPI）
const VOICE_CHAT_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat";

const DEFAULT_SITUATION = "小学校受験の面接";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  window.speechSynthesis.speak(utterance);
}

// 音声対話ページ（examination#62）。チャット風UIでユーザー自身の発言も画面に表示し、
// シチュエーション・志望先の特色を自由入力できるようにして汎用的な受験・面接練習
// アプリへ拡張した（examination#76）。音声認識・音声合成はブラウザ標準API
// （SpeechRecognition/SpeechSynthesis）を使う。一時期ブラウザ内AIモデル（ONNX Runtime
// Web + Piper、examination#73）へ置き換えたが、実機での動作未検証のまま公開してしまい
// 実際には音声認識・合成のいずれも動作せず、読み込みも重くなっていたため
// examination#112でブラウザ標準APIへ戻した
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
  const [isListening, setIsListening] = useState(false);

  const voiceTokenRef = useRef(null);
  const historyRef = useRef([]);
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();

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

  async function handleStart() {
    setIsError(false);
    setMessages([]);
    historyRef.current = [];
    setIsBusy(true);
    setStatus("会話を準備中...");
    try {
      await issueVoiceToken();
      const data = await sendToVoiceChat(null);
      historyRef.current = data.history;
      setMessages([{ speaker: "面接官", text: data.reply }]);
      speak(data.reply);
      setStarted(true);
      if (!SpeechRecognitionCtor) {
        setIsError(true);
        setStatus("このブラウザは音声認識に対応していません。Google Chrome等をお試しください。");
      } else {
        setStatus("");
      }
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    } finally {
      setIsBusy(false);
    }
  }

  function handleSpeak() {
    if (!SpeechRecognitionCtor) return;
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    let resultReceived = false;

    setIsError(false);
    setIsListening(true);
    setStatus("聞き取り中...");

    recognition.onresult = async (event) => {
      resultReceived = true;
      const said = event.results[0][0].transcript;
      setMessages((prev) => [...prev, { speaker: "あなた", text: said }]);
      setStatus("AIが応答を考えています...");
      try {
        const data = await sendToVoiceChat(said);
        historyRef.current = data.history;
        setMessages((prev) => [...prev, { speaker: "面接官", text: data.reply }]);
        speak(data.reply);
        setStatus("");
      } catch (error) {
        setIsError(true);
        setStatus(error.message);
      } finally {
        setIsListening(false);
      }
    };

    recognition.onerror = (event) => {
      resultReceived = true;
      setIsError(true);
      setStatus(`音声認識でエラーが発生しました（${event.error}）`);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (!resultReceived) {
        setIsError(true);
        setStatus("音声を認識できませんでした。もう一度お試しください。");
        setIsListening(false);
      }
    };

    recognition.start();
  }

  async function handleEnd() {
    setIsBusy(true);
    try {
      const res = await fetch(VOICE_CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${voiceTokenRef.current}` },
        body: JSON.stringify({
          role,
          situation,
          schoolCharacteristics,
          otherContext,
          history: historyRef.current,
          action: "end",
        }),
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

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">音声で面接練習</h1>
      <p className="mt-2 text-base-content/70">
        ブラウザの音声認識・音声合成機能を使って、声に出しながら面接練習ができます。マイクとスピーカーが使えるスマートフォン・PCのブラウザで利用してください。
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-base-content/70">
        <li>音声認識・音声合成はブラウザ標準機能を使うため追加費用はかかりません</li>
        <li>対応ブラウザ: Google Chrome、Microsoft Edge等（Safari・Firefoxは音声認識に対応していない場合があります）</li>
        <li>LINE botの面接練習とは別の、ブラウザだけで完結する会話形式の練習です</li>
      </ul>

      {!started ? (
        <div className="card card-border mt-6 bg-base-100">
          <div className="card-body gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">ロール:</span>
              <select value={role} onChange={(event) => setRole(event.target.value)} className="select">
                <option value="本人">本人</option>
                <option value="父">父</option>
                <option value="母">母</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">シチュエーション:</span>
              <input
                type="text"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                placeholder="例: 小学校受験の面接、就職の面接、大学入試の面接"
                className="input w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">志望先の特色（任意）:</span>
              <textarea
                value={schoolCharacteristics}
                onChange={(event) => setSchoolCharacteristics(event.target.value)}
                placeholder="例: 自由な校風で、生徒の主体性を重視する"
                rows={3}
                className="textarea w-full"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">その他前提情報（任意）:</span>
              <textarea
                value={otherContext}
                onChange={(event) => setOtherContext(event.target.value)}
                placeholder="例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など"
                rows={3}
                className="textarea w-full"
              />
            </label>
            <div className="card-actions">
              <button type="button" onClick={handleStart} disabled={isBusy} className="btn btn-primary">
                会話を始める
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex flex-col gap-2">
            {messages.map((message, index) => (
              <div key={index} className={`chat ${message.speaker === "あなた" ? "chat-end" : "chat-start"}`}>
                <div className="chat-header text-xs text-base-content/60">{message.speaker}</div>
                <div className="chat-bubble">{message.text}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={handleSpeak}
              disabled={!SpeechRecognitionCtor || isListening || isBusy}
              className="btn btn-primary"
            >
              話す
            </button>
            <button type="button" onClick={handleEnd} disabled={isListening || isBusy} className="btn btn-outline">
              練習を終える
            </button>
          </div>
        </div>
      )}

      {status && (
        <div role="alert" className={`alert mt-4 ${isError ? "alert-error" : "alert-info"}`}>
          <span>{status}</span>
        </div>
      )}
    </main>
  );
}
