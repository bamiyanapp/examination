# 閲覧許可メールアドレスの管理

このサイトを閲覧できるGoogleアカウントのメールアドレスを一覧・追加・削除できます。ログイン中のアカウントがこの一覧に含まれている場合のみ操作できます（含まれていない場合はこのページ自体が表示できません）。

- 自分自身のメールアドレスは削除できません（誤って全員が閲覧できなくなることを防ぐため）
- 一覧に残り1件しかない場合、それは削除できません
- 追加・削除は最大60秒ほどで全世界のアクセス地点に反映されます（すぐに反映されないことがあります）

<div id="allowed-emails-app">
  <p id="allowed-emails-status">読み込み中...</p>
  <ul id="allowed-emails-list"></ul>
  <form id="allowed-emails-add-form">
    <input type="email" id="allowed-emails-new-email" placeholder="追加するメールアドレス" required>
    <button type="submit">追加</button>
  </form>
</div>

<script>
(function () {
  var statusEl = document.getElementById("allowed-emails-status");
  var listEl = document.getElementById("allowed-emails-list");
  var formEl = document.getElementById("allowed-emails-add-form");
  var inputEl = document.getElementById("allowed-emails-new-email");

  function render(emails) {
    listEl.innerHTML = "";
    emails.forEach(function (item) {
      var li = document.createElement("li");
      li.textContent = item.email + "（追加者: " + (item.addedBy || "-") + "） ";
      var removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "削除";
      removeBtn.addEventListener("click", function () {
        mutate("remove", item.email);
      });
      li.appendChild(removeBtn);
      listEl.appendChild(li);
    });
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "crimson" : "";
  }

  function load() {
    setStatus("読み込み中...");
    fetch("/_admin/emails")
      .then(function (res) {
        if (!res.ok) throw new Error("読み込みに失敗しました（" + res.status + "）");
        return res.json();
      })
      .then(function (data) {
        setStatus("");
        render(data.emails || []);
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  function mutate(action, email) {
    setStatus("処理中...");
    fetch("/_admin/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, email: email }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "処理に失敗しました（" + res.status + "）");
          return data;
        });
      })
      .then(function (data) {
        setStatus("");
        render(data.emails || []);
      })
      .catch(function (err) {
        setStatus(err.message, true);
      });
  }

  formEl.addEventListener("submit", function (event) {
    event.preventDefault();
    var email = inputEl.value.trim();
    if (!email) return;
    mutate("add", email);
    inputEl.value = "";
  });

  load();
})();
</script>
