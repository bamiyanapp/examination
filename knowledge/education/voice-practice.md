# 音声で面接練習

ブラウザの音声認識・音声合成機能を使って、声に出しながら面接練習ができます（[Issue #62](https://github.com/bamiyanapp/examination/issues/62)）。マイクとスピーカーが使えるスマートフォン・PCのブラウザで利用してください。

- 音声認識・音声合成はブラウザ標準機能を使うため追加費用はかかりません
- 対応ブラウザ: Google Chrome、Microsoft Edge等（Safari・Firefoxは音声認識に対応していない場合があります）
- LINE botの面接練習とは別の、ブラウザだけで完結する会話形式の練習です

## 使い方

1. 練習するロール（本人・父・母）を選ぶ
2. 「会話を始める」を押すと、AIの面接官が最初の質問を音声で読み上げます
3. 「話す」を押してから声で回答すると、AIがフィードバックと次の質問を返します
4. 「話す」を押すたびに次のやり取りが続きます

<div id="voice-practice-app">
  <div>
    <label>
      ロール:
      <select id="voice-role-select">
        <option value="本人">本人</option>
        <option value="父">父</option>
        <option value="母">母</option>
      </select>
    </label>
    <button type="button" id="voice-start-button">会話を始める</button>
    <button type="button" id="voice-speak-button" disabled>話す</button>
  </div>
  <p id="voice-status"></p>
  <div id="voice-transcript"></div>
</div>

<script>
(function () {
  // bot-stack（examination-bot-prod）のHTTP APIエンドポイント。デプロイでURLが
  // 変わった場合はここを更新する（Job Summaryの「LINE bot Webhook URL」と同じAPI）
  var VOICE_CHAT_API_URL = "https://0yqos9utye.execute-api.us-east-1.amazonaws.com/voice-chat";

  var roleSelect = document.getElementById("voice-role-select");
  var startButton = document.getElementById("voice-start-button");
  var speakButton = document.getElementById("voice-speak-button");
  var statusEl = document.getElementById("voice-status");
  var transcriptEl = document.getElementById("voice-transcript");

  var voiceToken = null;
  var history = [];
  var role = null;

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.style.color = isError ? "crimson" : "";
  }

  function appendTranscript(speaker, text) {
    var p = document.createElement("p");
    p.textContent = speaker + ": " + text;
    transcriptEl.appendChild(p);
  }

  function speak(text) {
    if (!window.speechSynthesis) return;
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    window.speechSynthesis.speak(utterance);
  }

  function issueVoiceToken() {
    return fetch("/_voice-token", { method: "POST" })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "トークンの発行に失敗しました（" + res.status + "）");
          return data;
        });
      })
      .then(function (data) {
        voiceToken = data.token;
      });
  }

  function sendToVoiceChat(message) {
    return fetch(VOICE_CHAT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + voiceToken,
      },
      body: JSON.stringify({ role: role, history: history, message: message || undefined }),
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) throw new Error(data.error || "AI応答の取得に失敗しました（" + res.status + "）");
        return data;
      });
    });
  }

  startButton.addEventListener("click", function () {
    role = roleSelect.value;
    history = [];
    transcriptEl.textContent = "";
    startButton.disabled = true;
    setStatus("会話を準備中...");

    issueVoiceToken()
      .then(function () {
        return sendToVoiceChat(null);
      })
      .then(function (data) {
        history = data.history;
        appendTranscript("面接官", data.reply);
        speak(data.reply);
        setStatus("");
        speakButton.disabled = !SpeechRecognition;
        if (!SpeechRecognition) {
          setStatus("このブラウザは音声認識に対応していません。Google Chrome等をお試しください。", true);
        }
      })
      .catch(function (err) {
        setStatus(err.message, true);
      })
      .finally(function () {
        startButton.disabled = false;
      });
  });

  speakButton.addEventListener("click", function () {
    if (!SpeechRecognition) return;
    var recognition = new SpeechRecognition();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;

    speakButton.disabled = true;
    setStatus("聞き取り中...");

    recognition.onresult = function (event) {
      var said = event.results[0][0].transcript;
      appendTranscript("あなた", said);
      setStatus("AIが応答を考えています...");
      sendToVoiceChat(said)
        .then(function (data) {
          history = data.history;
          appendTranscript("面接官", data.reply);
          speak(data.reply);
          setStatus("");
        })
        .catch(function (err) {
          setStatus(err.message, true);
        })
        .finally(function () {
          speakButton.disabled = false;
        });
    };

    recognition.onerror = function (event) {
      setStatus("音声認識でエラーが発生しました（" + event.error + "）", true);
      speakButton.disabled = false;
    };

    recognition.onend = function () {
      if (speakButton.disabled && statusEl.textContent === "聞き取り中...") {
        setStatus("音声を認識できませんでした。もう一度お試しください。", true);
        speakButton.disabled = false;
      }
    };

    recognition.start();
  });
})();
</script>
