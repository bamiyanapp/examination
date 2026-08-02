"use strict";

const https = require("https");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

// gemini-2.0-flashはGoogle側で廃止(404 NOT_FOUND)されたため後継モデルに変更した
// （examination#74）
const GEMINI_MODEL = "gemini-2.5-flash";

// LINE bot（lineWebhook.js）・音声対話（voiceChat.js）の両方が使う面接練習の
// 会話ロジック（システムプロンプト生成・Gemini呼び出し）を共通化したモジュール
// （examination#76: 小学校受験専用から汎用的な受験・面接練習アプリへ拡張するにあたり、
// チャネルごとに別々だった会話ロジックを統一した）

// ロール選択の表示テキスト -> システムプロンプトに埋め込む説明
const ROLE_DESCRIPTIONS = {
  本人: "受験する本人の子ども",
  父: "父親（保護者面接）",
  母: "母親（保護者面接）",
};

const DEFAULT_SITUATION = "小学校受験の面接";
const MAX_FREE_TEXT_LENGTH = 200;

function sanitizeFreeText(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, MAX_FREE_TEXT_LENGTH);
  return trimmed || fallback;
}

function postJson(hostname, path, headers, bodyObj) {
  const body = JSON.stringify(bodyObj);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(data ? JSON.parse(data) : {});
            } catch (error) {
              reject(new Error(`invalid JSON response: ${data}`));
            }
          } else {
            reject(new Error(`request to ${hostname}${path} returned ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.end(body);
  });
}

function buildSystemPrompt({ role, situation, schoolCharacteristics }) {
  const roleDescription = ROLE_DESCRIPTIONS[role];
  const characteristicsText = schoolCharacteristics
    ? `志望先の特色は次の通りです。${schoolCharacteristics}。これを踏まえた質問も交えてください。`
    : "";
  return (
    `あなたは${situation}の面接官です。相手は` +
    roleDescription +
    "です。" +
    characteristicsText +
    "一度に1つだけ質問してください。相手の回答には親しみやすい口調で一言フィードバックしてから、" +
    "自然に次の質問へ進めてください。質問は面接でよく聞かれる内容（志望動機、家庭の様子、" +
    "本人の性格や好きなこと等）から選んでください。簡潔な日本語の文章のみで答え、記号や" +
    "箇条書きは使わないでください。"
  );
}

// messages形式（role: system/user/assistant）をGeminiのcontents形式に変換して呼ぶ。
// systemロールはGeminiのsystemInstructionへ、assistantはmodelロールへ対応させる。
// 単発プロンプト（system無し・messages 1件）にも、複数ターンの会話履歴付き呼び出しにも使える
async function callGemini(messages) {
  const systemMessage = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  // Gemini APIはsystemInstructionのみでcontentsが空だと400を返すため、会話開始時
  // （履歴が無い最初のターン）は開始を促すユーザーターンを補う（examination#71）
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: "面接を始めてください。最初の質問をお願いします。" }] });
  }
  const response = await postJson(
    "generativelanguage.googleapis.com",
    `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`,
    {},
    {
      systemInstruction: systemMessage ? { parts: [{ text: systemMessage.content }] } : undefined,
      contents,
    }
  );
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini response missing text: ${JSON.stringify(response)}`);
  }
  return text;
}

module.exports = {
  postJson,
  ROLE_DESCRIPTIONS,
  DEFAULT_SITUATION,
  sanitizeFreeText,
  buildSystemPrompt,
  callGemini,
};
