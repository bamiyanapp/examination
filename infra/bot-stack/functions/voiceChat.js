"use strict";

const {
  ROLE_DESCRIPTIONS,
  DEFAULT_SITUATION,
  sanitizeFreeText,
  buildSystemPrompt,
  callGemini,
  parseDualReply,
  summarizeMockInterview,
} = require("./geminiConversation");
const { verifyBearerEmail } = require("./apiAuth");
const { hasMeaningfulContent, saveMockInterviewSummary } = require("./mockInterviews");
const { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage } = require("./aiApiLimit");

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
  // 志望先の特色欄では拾いきれない情報（家族情報等）を補う自由記述欄（examination#76）
  const otherContext = sanitizeFreeText(payload.otherContext, "");
  const history = Array.isArray(payload.history) ? payload.history : [];
  const userMessage = typeof payload.message === "string" ? payload.message.trim() : "";

  // 音声対話ページには（LINEの「終了」コマンドに相当する）練習を終える明示的な
  // 操作が無かったため、専用のaction値を新設した（examination#93）。会話履歴を
  // 振り返って模擬面接記録のサマリーを生成・保存する。失敗しても練習の終了自体は
  // ブロックしない
  if (payload.action === "end") {
    if (!hasMeaningfulContent(history)) {
      return jsonResponse(200, { saved: false });
    }
    // サマリー生成もGemini呼び出しの1つとして上限にカウントする。ただし練習の
    // 終了自体は他の失敗ケースと同様にブロックしない（examination#124）
    if (!(await incrementAndCheckAiApiUsage(email))) {
      console.warn("AI API daily limit exceeded (end)", email);
      return jsonResponse(200, { saved: false });
    }
    try {
      const summary = await summarizeMockInterview({ role, situation, schoolCharacteristics, history });
      await saveMockInterviewSummary({ role, situation, schoolCharacteristics, channel: "voice", summary, createdBy: email });
      return jsonResponse(200, { saved: true });
    } catch (error) {
      console.error("Mock interview summary failed", error.message);
      return jsonResponse(200, { saved: false });
    }
  }

  // AI API呼び出しの1日あたりの上限チェック（examination#124）。/_voice-token発行回数の
  // 上限（examination#69）とは別に、実際のGemini呼び出し回数そのものを制限する
  if (!(await incrementAndCheckAiApiUsage(email))) {
    return jsonResponse(429, {
      error: `本日のAI応答生成の上限（${AI_API_DAILY_LIMIT}回）に達しました。日付が変わってからお試しください。`,
    });
  }

  const messages = [
    { role: "system", content: buildSystemPrompt({ role, situation, schoolCharacteristics, otherContext }) },
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
