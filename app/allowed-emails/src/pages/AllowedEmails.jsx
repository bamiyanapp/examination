import { useCallback, useEffect, useState } from "react";

// 家族の最後の1人が自分自身を削除する（退会する）と、家族の全データが
// 完全に削除される（examination#284）。誤操作を防ぐため、実行前にこの内容の
// 警告を表示し、明示的な同意を得てから実行する
const SELF_DELETE_WARNING =
  "本当に退会しますか？\n\nあなたはこの家族の最後のメンバーです。退会すると、想定問答・模擬面接記録・" +
  "プロフィール・LINE連携を含む家族の全データが完全に削除され、元に戻せません。";

// 閲覧許可メールアドレスの一覧・追加・削除ページ（examination#78）。
// 旧: knowledge/settings/allowed-emails.md に埋め込まれていた素の<script>実装をReactへ移植した。
// 呼び出し先API（/_admin/emails）自体は変更しない
export default function AllowedEmails() {
  const [emails, setEmails] = useState([]);
  const [myEmail, setMyEmail] = useState("");
  const [status, setStatus] = useState("読み込み中...");
  const [isError, setIsError] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(async () => {
    setIsError(false);
    setStatus("読み込み中...");
    try {
      const res = await fetch("/_admin/emails");
      if (!res.ok) {
        throw new Error(`読み込みに失敗しました（${res.status}）`);
      }
      const data = await res.json();
      setEmails(data.emails || []);
      setStatus("");
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch("/_me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.email) setMyEmail(data.email);
      })
      .catch(() => {
        // 取得失敗時は自分の行の特別表示（退会ボタン）を諦めるだけでよい
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function mutate(action, email) {
    setIsError(false);
    setStatus("処理中...");
    try {
      const res = await fetch("/_admin/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `処理に失敗しました（${res.status}）`);
      }
      if (data.familyDeleted) {
        // 家族データごと削除された直後はセッション自体が無意味になるため、
        // Googleセッションも含めて完全にログアウトする（examination#271・#284）
        window.location.href = "/_logout";
        return;
      }
      setEmails(data.emails || []);
      setStatus("");
    } catch (error) {
      setIsError(true);
      setStatus(error.message);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const email = newEmail.trim();
    if (!email) return;
    mutate("add", email);
    setNewEmail("");
  }

  function handleSelfDelete(email) {
    if (window.confirm(SELF_DELETE_WARNING)) {
      mutate("remove", email);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold">閲覧許可メールアドレスの管理</h1>
      <p className="mt-2 text-base-content/70">
        このサイトを閲覧できるGoogleアカウントのメールアドレスを、自分の所属家族の範囲で一覧・追加・削除できます（
        <a href="https://github.com/bamiyanapp/examination/issues/44" className="link">
          複数家族対応
        </a>
        ）。ログイン中のアカウントがこの一覧に含まれている場合のみ操作できます（含まれていない場合はこのページ自体が表示できません）。新しい家族を作りたい相手は、招待不要で
        <a href="/family-create/" className="link">
          家族の新規作成ページ
        </a>
        から直接作成できます。
      </p>
      <ul className="mt-2 list-inside list-disc text-sm text-base-content/70">
        <li>自分自身のメールアドレスは、他のメンバーが残っている間は削除できません（誤って他のメンバーの閲覧を止めてしまうことを防ぐため）</li>
        <li>自分が家族の最後の1人の場合のみ、自分自身を削除（退会）できます。退会すると想定問答・模擬面接記録等を含む家族の全データが完全に削除され、元に戻せません</li>
        <li>既に何らかの家族に所属しているメールアドレスは追加できません（1メールアドレスにつき所属できる家族は1つまで）</li>
        <li>追加・削除は最大15秒ほどで全世界のアクセス地点に反映されます（すぐに反映されないことがあります）</li>
      </ul>
      {isError && status && (
        <div role="alert" className="alert alert-error mt-4">
          <span>{status}</span>
        </div>
      )}
      {!isError && status && (
        <div className="mt-4 flex items-center gap-2 text-base-content/70">
          <span className="loading loading-spinner loading-sm" />
          {status}
        </div>
      )}
      <ul className="list mt-4 rounded-box bg-base-100 shadow-sm">
        {emails.map((item) => {
          const isMe = item.email === myEmail;
          const isLastMember = emails.length === 1;
          return (
            <li key={item.email} className="list-row items-center">
              <div className="flex-1">
                {item.email}（追加者: {item.addedBy || "-"}）{isMe && "（自分）"}
              </div>
              {isMe ? (
                <button
                  type="button"
                  onClick={() => handleSelfDelete(item.email)}
                  disabled={!isLastMember}
                  title={isLastMember ? "" : "先に他のメンバーを削除してください"}
                  className="btn btn-sm btn-error"
                >
                  退会して家族データを削除する
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => mutate("remove", item.email)}
                  className="btn btn-sm btn-outline btn-error"
                >
                  削除
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <form onSubmit={handleSubmit} className="join mt-6 w-full">
        <input
          type="email"
          placeholder="追加するメールアドレス"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          className="input join-item flex-1"
        />
        <button type="submit" className="btn btn-primary join-item">
          追加
        </button>
      </form>
    </main>
  );
}
