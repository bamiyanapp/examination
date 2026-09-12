import { useEffect, useState, type FormEvent } from "react";

// checkAuth.jsのcreateFamilyが返す文言と一致させる。既に所属済みという応答は、
// 失敗ではなく「反映待ちで表示だけがこのページのまま」という状態を示すサインとして
// 特別扱いする（examination#267）
const ALREADY_IN_FAMILY_MESSAGE = "既に家族に所属しています";

interface CreatedFamily {
  slug: string;
  situation: string;
}

async function createFamily(situation: string): Promise<CreatedFamily> {
  const res = await fetch("/_families", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ situation }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `家族の作成に失敗しました（${res.status}）`);
  }
  return data;
}

// 家族の新規作成ページ（examination#44・#242・#258）。公開登録制のため、
// Googleアカウントでログインしていれば誰でも利用できる。既に何らかの家族に
// 所属している場合は/_families側で拒否される。作成に成功したら、そのまま
// サイトのトップページへ案内する。
//
// 家族名ではなくシチュエーション（例:「小学校受験の面接」）を入力させる
// （examination#305、家族名とシチュエーションの統合）。入力内容はトップページの
// 見出し・AI練習のプロンプトに使われ、後から/settings/profile-edit/でいつでも
// 変更できる
//
// examination#437でサイトワイドの認証ゲートを廃止したため、未ログインでも
// このページ自体には到達できる。マウント時に/_meでログイン状態を確認し、
// 未ログインならフォームの代わりにログインへの案内を表示する（/_familiesは
// 未ログイン時に403（プレーンテキストボディ）を返すため、フォーム送信に
// 任せるとres.json()が失敗し分かりにくいエラーになってしまう）
export default function FamilyCreate() {
  const [situation, setSituation] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [createdFamily, setCreatedFamily] = useState<CreatedFamily | null>(null);
  const [alreadyInFamily, setAlreadyInFamily] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/_me")
      .then((res) => {
        if (!cancelled) setIsLoggedIn(res.ok);
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setAlreadyInFamily(false);
    try {
      const family = await createFamily(situation);
      setCreatedFamily(family);
    } catch (error) {
      // 許可判定はLambda@Edgeの実行環境ごとに最大15秒キャッシュされるため
      // （examination#267）、作成直後に他ページへ遷移してこのページへ戻された
      // 場合、既に成功しているにもかかわらずこのエラーになることがある。
      // 失敗と誤解させないよう、待機を促す案内として別枠で表示する
      const message = error instanceof Error ? error.message : String(error);
      if (message === ALREADY_IN_FAMILY_MESSAGE) {
        setAlreadyInFamily(true);
      } else {
        setErrorMessage(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoggedIn === null) {
    return (
      <main className="container py-5" style={{ maxWidth: "42rem" }}>
        <div className="d-flex align-items-center gap-2 text-muted">
          <span className="spinner-border spinner-border-sm" role="status" />
          読み込み中...
        </div>
      </main>
    );
  }

  if (!isLoggedIn) {
    return (
      <main className="container py-5" style={{ maxWidth: "42rem" }}>
        <h1 className="h3 fw-bold">家族の新規作成</h1>
        <p className="mt-2 text-muted">家族を新規作成するには、Googleアカウントでログインしてください。</p>
        <a href="/_login?redirect=/family-create/" className="btn btn-primary">
          ログイン
        </a>
      </main>
    );
  }

  return (
    <main className="container py-5" style={{ maxWidth: "42rem" }}>
      <h1 className="h3 fw-bold">家族の新規作成</h1>
      <p className="mt-2 text-muted">
        Googleアカウントでログイン済みで、まだどの家族にも所属していない方なら、シチュエーション（例:
        「小学校受験の面接」）を指定して新しい家族を作成できます。作成したメールアドレスがその家族の最初のメンバーになります。入力したシチュエーションは、後から「設定
        → プロフィール編集」でいつでも変更できます。
      </p>

      {createdFamily ? (
        <div role="alert" className="alert alert-success mt-4">
          「{createdFamily.situation}」を作成しました。<a href="/" className="alert-link">トップページへ進む</a>
        </div>
      ) : alreadyInFamily ? (
        <div role="alert" className="alert alert-info mt-4">
          このアカウントは既に家族に参加済みです。反映まで少し時間がかかることがあるため、15秒ほど待ってから
          <a href="/" className="alert-link">トップページへ進む</a>
          を試してください。
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="card mt-4">
          <div className="card-body d-flex flex-column gap-3">
            <div>
              <label className="form-label fw-medium">シチュエーション:</label>
              <input
                type="text"
                value={situation}
                onChange={(event) => setSituation(event.target.value)}
                placeholder="例: 小学校受験の面接"
                required
                className="form-control"
              />
            </div>
            <div>
              <button type="submit" disabled={isSubmitting || !situation.trim()} className="btn btn-primary">
                {isSubmitting ? "作成中..." : "作成する"}
              </button>
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
