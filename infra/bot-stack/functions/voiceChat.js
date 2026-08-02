"use strict";

const { DynamoDBClient, GetItemCommand } = require("@aws-sdk/client-dynamodb");
const { ROLE_DESCRIPTIONS, DEFAULT_SITUATION, sanitizeFreeText, buildSystemPrompt, callGemini } = require("./geminiConversation");

const VOICE_TOKENS_TABLE = "examination-voice-tokens";
const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";

const ddb = new DynamoDBClient({ region: "us-east-1" });

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
  const situation = sanitizeFreeText(payload.situation, DEFAULT_SITUATION);
  const schoolCharacteristics = sanitizeFreeText(payload.schoolCharacteristics, "");
  const history = Array.isArray(payload.history) ? payload.history : [];
  const userMessage = typeof payload.message === "string" ? payload.message.trim() : "";

  const messages = [
    { role: "system", content: buildSystemPrompt({ role, situation, schoolCharacteristics }) },
    ...history,
  ];
  if (userMessage) {
    messages.push({ role: "user", content: userMessage });
  }

  let reply;
  try {
    reply = await callGemini(messages);
  } catch (error) {
    console.error("Gemini call failed", error.message);
    return jsonResponse(502, { error: "AI応答の生成に失敗しました" });
  }

  const updatedHistory = userMessage
    ? [...history, { role: "user", content: userMessage }, { role: "assistant", content: reply }]
    : [...history, { role: "assistant", content: reply }];

  return jsonResponse(200, { reply, history: updatedHistory });
};
