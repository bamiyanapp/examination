import { useEffect, useRef, useState } from "react";

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（Job Summaryの「LINE bot Webhook URL」と同じAPI）
const VOICE_CHAT_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat";
const FAMILY_PROFILE_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile";

const DEFAULT_SITUATION = "小学校受験の面接";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition || window.webkitSpeechRecognition;
}

// 利用可能な音声（SpeechSynthesis.getVoices()）の中から日本語音声のうち
// 最も品質が高いと期待できるものを選ぶ（examination#158）。localService: false
// （ブラウザが自動選択する端末内蔵音声ではなく、Google等が提供するネットワーク
// 経由の音声）は一般に端末内蔵の音声より自然で聞き取りやすいため優先する
function pickJapaneseVoice(voices) {
  const jaVoices = (voices || []).filter((voice) => voice.lang && voice.lang.toLowerCase().startsWith("ja"));
  if (jaVoices.length === 0) return null;
  return jaVoices.find((voice) => voice.localService === false) || jaVoices[0];
}

function speak(text, voices) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voice = pickJapaneseVoice(voices);
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

// 音声対話ページ（examination#62）。チャット風UIでユーザー自身の発言も画面に表示し、
// 汎用的な受験・面接練習アプリへ拡張した（examination#76）。シチュエーション・
// 志望先の特色・その他前提情報は以前はこの画面で毎回自由入力していたが、練習の度に
// 入力し直すものではないため、専用のプロフィール編集画面（app/profile-edit/）へ
// 移設した（examination#125、シチュエーションはexamination#135）。この画面では
// 保存済みの内容を参照表示するのみで、編集はできない（実際にGeminiへ渡す値も
// サーバー側（voiceChat.js）がプロフィールから直接解決する）。音声認識・音声合成は
// ブラウザ標準API（SpeechRecognition/SpeechSynthesis）を使う。一時期ブラウザ内AI
// モデル（ONNX Runtime Web + Piper、examination#73）へ置き換えたが、実機での動作
// 未検証のまま公開してしまい実際には音声認識・合成のいずれも動作せず、読み込みも
// 重くなっていたためexamination#112でブラウザ標準APIへ戻した。読み上げ品質の
// 低さ（examination#158）についても、piper-plus等のブラウザ内AIモデル再導入は
// 追加ダウンロードがgzip後20MBを超え同種の問題を再発するリスクが高いと判断し、
// 追加ダウンロード無しで実現できる音声選択の改善（pickJapaneseVoice）にとどめた
export default function VoicePractice() {
  const [role, setRole] = useState("本人");
  const [profileStatus, setProfileStatus] = useState("loading");
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
  const voicesRef = useRef([]);
  const SpeechRecognitionCtor = getSpeechRecognitionCtor();

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    // Chrome等は音声一覧の準備が非同期のため、初回取得が空配列のことがある
    // （voiceschangedイベントで後から確定する、examination#158）
    function updateVoices() {
      voicesRef.current = window.speechSynthesis.getVoices();
    }
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      try {
        const res = await fetch("/_voice-token", { method: "POST" });
        const tokenData = await res.json();
        if (!res.ok) throw new Error(tokenData.error || `トークンの発行に失敗しました（${res.status}）`);
        const profileRes = await fetch(FAMILY_PROFILE_API_URL, {
          headers: { Authorization: `Bearer ${tokenData.token}` },
        });
        const profileData = await profileRes.json();
        if (!profileRes.ok) throw new Error(profileData.error || `プロフィールの取得に失敗しました（${profileRes.status}）`);
        if (!cancelled) {
          const resolvedSituation = profileData.situation || DEFAULT_SITUATION;
          setSituation(resolvedSituation);
          setSchoolCharacteristics(profileData.schoolCharacteristics || "");
          setOtherContext(profileData.otherContext || "");
          setProfileStatus("loaded");
          // タブタイトルを固定文言でなくシチュエーション名にする（examination#157）。
          // 複数のシチュエーションを使い分ける場合や、PWAとしてホーム画面に追加した
          // 際に、どの練習用画面かをタイトルだけで区別しやすくする。プロフィールで
          // シチュエーションを未設定の場合も、画面表示（シチュエーション:
          // {situation}）と一致させるためDEFAULT_SITUATIONへフォールバックする
          // （examination#157再発: 未設定時にタイトルが更新されない不具合を修正）
          document.title = `${resolvedSituation} | 小学校受験対策`;
        }
      } catch {
        // プロフィールの参照表示に失敗しても、練習自体（サーバー側が別途プロフィールを
        // 参照する）はブロックしない
        if (!cancelled) setProfileStatus("error");
      }
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

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
      speak(data.reply, voicesRef.current);
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
        speak(data.reply, voicesRef.current);
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
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">{situation}</h1>
      <p className="mt-2 text-muted">
        ブラウザの音声認識・音声合成機能を使って、声に出しながら面接練習ができます。マイクとスピーカーが使えるスマートフォン・PCのブラウザで利用してください。
      </p>
      <ul className="mt-2 small text-muted">
        <li>音声認識・音声合成はブラウザ標準機能を使うため追加費用はかかりません</li>
        <li>対応ブラウザ: Google Chrome、Microsoft Edge等（Safari・Firefoxは音声認識に対応していない場合があります）</li>
        <li>LINE botの面接練習とは別の、ブラウザだけで完結する会話形式の練習です</li>
      </ul>

      {!started ? (
        <div className="card mt-4">
          <div className="card-body d-flex flex-column gap-3">
            <div>
              <label className="form-label fw-medium">ロール:</label>
              <select value={role} onChange={(event) => setRole(event.target.value)} className="form-select">
                <option value="本人">本人</option>
                <option value="父">父</option>
                <option value="母">母</option>
              </select>
            </div>
            <div className="d-flex flex-column gap-1">
              <span className="fw-medium">シチュエーション・志望先の特色・その他前提情報:</span>
              {profileStatus === "loading" && (
                <span className="d-flex align-items-center gap-2 small text-muted">
                  <span className="spinner-border spinner-border-sm" role="status" />
                  読み込み中...
                </span>
              )}
              {profileStatus === "loaded" && (
                <div className="rounded bg-body-secondary p-3 small">
                  <p>シチュエーション: {situation}</p>
                  <p>志望先の特色: {schoolCharacteristics || "（未設定）"}</p>
                  <p className="mb-0">その他前提情報: {otherContext || "（未設定）"}</p>
                </div>
              )}
              {profileStatus === "error" && <span className="small text-muted">プロフィールの読み込みに失敗しました。</span>}
              <a href="/settings/profile-edit/" className="align-self-start small">
                プロフィール編集で変更する →
              </a>
            </div>
            <div>
              <button type="button" onClick={handleStart} disabled={isBusy} className="btn btn-primary">
                会話を始める
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <div className="d-flex flex-column gap-2">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`d-flex flex-column ${message.speaker === "あなた" ? "align-items-end" : "align-items-start"}`}
              >
                <div className="small text-muted">{message.speaker}</div>
                <div
                  className={`p-2 px-3 rounded-3 ${message.speaker === "あなた" ? "bg-primary text-white" : "bg-body-secondary"}`}
                  style={{ maxWidth: "80%" }}
                >
                  {message.text}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 d-flex gap-2">
            <button
              type="button"
              onClick={handleSpeak}
              disabled={!SpeechRecognitionCtor || isListening || isBusy}
              className="btn btn-primary"
            >
              話す
            </button>
            <button type="button" onClick={handleEnd} disabled={isListening || isBusy} className="btn btn-outline-secondary">
              練習を終える
            </button>
          </div>
        </div>
      )}

      {status && (
        <div role="alert" className={`alert mt-3 mb-0 ${isError ? "alert-danger" : "alert-info"}`}>
          {status}
        </div>
      )}
    </main>
  );
}
