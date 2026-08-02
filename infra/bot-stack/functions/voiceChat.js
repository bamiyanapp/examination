"use strict";

const https = require("https");
const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const VOICE_TOKENS_TABLE = "examination-voice-tokens";
const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";
const OPENAI_MODEL = "gpt-4o-mini";

const ddb = new DynamoDBClient({ region: "us-east-1" });

// ロール選択の表示テキスト -> システムプロンプトに埋め込む説明（examination#62）
const ROLE_DESCRIPTIONS = {
  本人: "受験する本人の子ども",
  父: "父親（保護者面接）",
  母: "母親（保護者面接）",
};

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
              resolve(JSON.parse(data));
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

async function callOpenAI(messages) {
  const response = await postJson(
    "api.openai.com",
    "/v1/chat/completions",
    { Authorization: `Bearer ${config.openaiApiKey}` },
    { model: OPENAI_MODEL, messages }
  );
  const text = response.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error(`OpenAI response missing text: ${JSON.stringify(response)}`);
  }
  return text;
}

// サイト（checkAuth.js）が/_voice-tokenで発行した短期トークンを検証する（examination#62）。
// LINE連携のワンタイムコードと違い、会話中に何度も呼ばれるため消費（削除）はしない
async function verifyVoiceToken(token) {
  const result = await ddb.send(new GetItemCommand({ TableName: VOICE_TOKENS_TABLE, Key: { token: { S: token } } }));
  if (!result.Item) return null;
  const expiresAt = Number(result.Item.expiresAt?.N || 0);
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;
  return result.Item.email.S;
}

async function isEmailAllowed(email) {
  const result = await ddb.send(new GetItemCommand({ TableName: ALLOWED_EMAILS_TABLE, Key: { email: { S: email } } }));
  return Boolean(result.Item);
}

function buildSystemPrompt(role) {
  const roleDescription = ROLE_DESCRIPTIONS[role];
  return (
    "あなたは小学校受験の面接官です。相手は" +
    roleDescription +
    "です。一度に1つだけ質問してください。相手の回答には親しみやすい口調で一言フィードバックしてから、" +
    "自然に次の質問へ進めてください。質問は小学校受験の面接でよく聞かれる内容（志望動機、家庭の様子、" +
    "本人の性格や好きなこと等）から選んでください。応答は音声で読み上げられるため、簡潔な日本語の" +
    "文章のみで答え、記号や箇条書きは使わないでください。"
  );
}

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (!token) {
    return jsonResponse(403, { error: "認証トークンがありません" });
  }
  const email = await verifyVoiceToken(token);
  if (!email || !(await isEmailAllowed(email))) {
    return jsonResponse(403, { error: "アクセスが許可されていません" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "invalid JSON" });
  }

  const role = payload.role;
  if (!ROLE_DESCRIPTIONS[role]) {
    return jsonResponse(400, { error: "roleは本人・父・母のいずれかを指定してください" });
  }
  const history = Array.isArray(payload.history) ? payload.history : [];
  const userMessage = typeof payload.message === "string" ? payload.message.trim() : "";

  const messages = [{ role: "system", content: buildSystemPrompt(role) }, ...history];
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  let reply;
  try {
    reply = await callOpenAI(messages);
  } catch (error) {
    console.error("OpenAI call failed", error.message);
    return jsonResponse(502, { error: "AI応答の生成に失敗しました" });
  }

  const updatedHistory = userMessage
    ? [...history, { role: "user", content: userMessage }, { role: "assistant", content: reply }]
    : [...history, { role: "assistant", content: reply }];

  return jsonResponse(200, { reply, history: updatedHistory });
};
