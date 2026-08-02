import { useCallback, useEffect, useState } from "react";

// 閲覧許可メールアドレスの一覧・追加・削除ページ（examination#78）。
// 旧: knowledge/settings/allowed-emails.md に埋め込まれていた素の<script>実装をReactへ移植した。
// 呼び出し先API（/_admin/emails）自体は変更しない
export default function AllowedEmails() {
  const [emails, setEmails] = useState([]);
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

  return (
    <main>
      <h1>閲覧許可メールアドレスの管理</h1>
      <p>
        このサイトを閲覧できるGoogleアカウントのメールアドレスを一覧・追加・削除できます。ログイン中のアカウントがこの一覧に含まれている場合のみ操作できます（含まれていない場合はこのページ自体が表示できません）。
      </p>
      <ul>
        <li>自分自身のメールアドレスは削除できません（誤って全員が閲覧できなくなることを防ぐため）</li>
        <li>一覧に残り1件しかない場合、それは削除できません</li>
        <li>追加・削除は最大60秒ほどで全世界のアクセス地点に反映されます（すぐに反映されないことがあります）</li>
      </ul>
      <p style={{ color: isError ? "crimson" : undefined }}>{status}</p>
      <ul>
        {emails.map((item) => (
          <li key={item.email}>
            {item.email}（追加者: {item.addedBy || "-"}）{" "}
            <button type="button" onClick={() => mutate("remove", item.email)}>
              削除
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="追加するメールアドレス"
          required
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
        />
        <button type="submit">追加</button>
      </form>
    </main>
  );
}
