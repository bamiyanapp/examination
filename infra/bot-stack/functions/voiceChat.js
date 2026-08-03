"use strict";

const {
  ROLE_DESCRIPTIONS,
  DEFAULT_SITUATION,
  sanitizeFreeText,
  buildSystemPrompt,
  callGemini,
  parseDualReply,
} = require("./geminiConversation");
const { verifyBearerEmail } = require("./apiAuth");

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const email = await verifyBearerEmail(event);
  if (!email) {
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

  let rawReply;
  try {
    rawReply = await callGemini(messages);
  } catch (error) {
    console.error("Gemini call failed", error.message);
    return jsonResponse(502, { error: "AI応答の生成に失敗しました" });
  }
  // 音声で読み上げる内容（voice）とチャット画面に表示する内容（text）を分けて
  // 生成させる（examination#89）。読み上げ・表示にはvoiceを使い、次ターンの
  // Geminiへの入力コンテキストにはより詳しいtextを記録する
  const { voice, text: textReply } = parseDualReply(rawReply);

  const updatedHistory = userMessage
    ? [...history, { role: "user", content: userMessage }, { role: "assistant", content: textReply }]
    : [...history, { role: "assistant", content: textReply }];

  return jsonResponse(200, { reply: voice, history: updatedHistory });
};
