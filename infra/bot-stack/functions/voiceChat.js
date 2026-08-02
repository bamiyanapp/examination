"use strict";

const { ROLE_DESCRIPTIONS, DEFAULT_SITUATION, sanitizeFreeText, buildSystemPrompt, callGemini } = require("./geminiConversation");
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
