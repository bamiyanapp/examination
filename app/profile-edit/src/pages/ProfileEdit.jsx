import { useEffect, useRef, useState } from "react";
import resizeToFitContent from "../components/resizeTextareaToFitContent.js"; // symlink先: dev-standards#164

// bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
// 変わった場合はここを更新する（app/voice-practice/src/pages/VoicePractice.jsxと同じAPI）
const FAMILY_PROFILE_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/family-profile";

async function issueVoiceToken() {
  const res = await fetch("/_voice-token", { method: "POST" });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `トークンの発行に失敗しました（${res.status}）`);
  }
  return data.token;
}

async function fetchProfile(token) {
  const res = await fetch(FAMILY_PROFILE_API_URL, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `プロフィールの取得に失敗しました（${res.status}）`);
  }
  return data;
}

async function saveProfile(token, profile) {
  const res = await fetch(FAMILY_PROFILE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(profile),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `プロフィールの保存に失敗しました（${res.status}）`);
  }
  return data;
}

// プロフィール編集画面（examination#125）。「志望先の特色」「その他前提情報」は
// 以前は面接練習（音声対話ページ・LINE bot）のたびに毎回自由入力していたが、
// 練習の度に入力し直すものではないため、この専用画面で編集・保存するように移設した。
// 面接練習側は保存された内容を参照するのみで、その場での編集はできない
export default function ProfileEdit() {
  const [status, setStatus] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [situation, setSituation] = useState("");
  const [schoolCharacteristics, setSchoolCharacteristics] = useState("");
  const [otherContext, setOtherContext] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const tokenRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = await issueVoiceToken();
        tokenRef.current = token;
        const profile = await fetchProfile(token);
        if (!cancelled) {
          setSituation(profile.situation || "");
          setSchoolCharacteristics(profile.schoolCharacteristics || "");
          setOtherContext(profile.otherContext || "");
          setStatus("loaded");
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message);
          setStatus("error");
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    setSavedMessage("");
    setErrorMessage("");
    try {
      const token = tokenRef.current || (await issueVoiceToken());
      tokenRef.current = token;
      await saveProfile(token, { situation, schoolCharacteristics, otherContext });
      setSavedMessage("保存しました。");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">プロフィール編集</h1>
      <p className="mt-2 text-muted">
        面接練習（音声対話ページ・LINE
        bot）で使う「シチュエーション」「志望先の特色」「その他前提情報」をここで編集・保存します。面接練習画面ではここで保存した内容を参照するのみで、その場での編集はできません。
      </p>

      {status === "loading" && (
        <div className="mt-4 d-flex align-items-center gap-2 text-muted">
          <span className="spinner-border spinner-border-sm" role="status" />
          読み込み中...
        </div>
      )}

      {status === "error" && (
        <div role="alert" className="alert alert-danger mt-4">
          {errorMessage}
        </div>
      )}

      {status === "loaded" && (
        <form onSubmit={handleSave} className="card mt-4">
          <div className="card-body d-flex flex-column gap-3">
            <div>
              <label className="form-label fw-medium">シチュエーション:</label>
              <input
                type="text"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                placeholder="例: 小学校受験の面接、就職の面接、大学入試の面接"
                className="form-control"
              />
            </div>
            <div>
              <label className="form-label fw-medium">志望先の特色（任意）:</label>
              <textarea
                value={schoolCharacteristics}
                onChange={(event) => setSchoolCharacteristics(event.target.value)}
                onInput={(event) => resizeToFitContent(event.target)}
                ref={resizeToFitContent}
                placeholder="例: 自由な校風で、生徒の主体性を重視する"
                className="form-control"
                style={{ resize: "none", overflow: "hidden" }}
              />
            </div>
            <div>
              <label className="form-label fw-medium">その他前提情報（任意）:</label>
              <textarea
                value={otherContext}
                onChange={(event) => setOtherContext(event.target.value)}
                onInput={(event) => resizeToFitContent(event.target)}
                ref={resizeToFitContent}
                placeholder="例: 志望先の特色欄では書ききれない、家族構成や志望動機の背景など"
                className="form-control"
                style={{ resize: "none", overflow: "hidden" }}
              />
            </div>
            <div className="d-flex align-items-center gap-3">
              <button type="submit" disabled={isSaving} className="btn btn-primary">
                保存する
              </button>
              {savedMessage && <span className="small text-success">{savedMessage}</span>}
            </div>
            {errorMessage && (
              <div role="alert" className="alert alert-danger mb-0">
                {errorMessage}
              </div>
            )}
          </div>
        </form>
      )}
    </main>
  );
}
