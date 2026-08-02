# LINE連携

LINE botで面接練習・想定問答の登録を行うには、あなたのGoogleアカウントとLINEアカウントを連携する必要があります。

1. 下のボタンでワンタイムコードを発行する
2. 発行されたコード（6桁の数字）を、LINE公式アカウントへそのままメッセージとして送信する
3. 連携完了のメッセージが届けば準備完了です

コードの有効期限は10分です。期限が切れた場合は、もう一度ボタンを押して発行し直してください。

<div id="line-link-app">
  <button type="button" id="line-link-issue-button">コードを発行</button>
  <p id="line-link-status"></p>
</div>

<script>
(function () {
  var button = document.getElementById("line-link-issue-button");
  var statusEl = document.getElementById("line-link-status");

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "crimson" : "";
  }

  button.addEventListener("click", function () {
    setStatus("発行中...");
    fetch("/_link-line", { method: "POST" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "発行に失敗しました（" + res.status + "）");
          return data;
        });
      })
      .then(function (data) {
        setStatus("コード: " + data.code + "（このコードをLINE botへ送信してください。10分間有効です）");
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  });
})();
</script>
