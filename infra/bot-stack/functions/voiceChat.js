"use strict";

const {
  ROLE_DESCRIPTIONS,
  buildSystemPrompt,
  callGemini,
  parseDualReply,
  summarizeMockInterview,
} = require("./geminiConversation");
const { verifyBearerEmail } = require("./apiAuth");
const { hasMeaningfulContent, saveMockInterviewSummary } = require("./mockInterviews");
const { getFamilyProfile } = require("./familyProfile");
const { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage } = require("./aiApiLimit");
const { queryQuestionsByTargetPerson, applyReconciliationResults } = require("./interviewQuestionsStore");

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
  // シチュエーション・志望先の特色・その他前提情報はプロフィール編集画面で
  // 編集・保存された値をサーバー側で参照する（examination#125、シチュエーションは
  // examination#135）。以前はクライアントから毎回自由入力を受け取っていたが、
  // 練習の度に入力し直すものではないため撤去した。LINE bot（lineWebhook.js）とも
  // 同じ単一の情報源を参照することで両チャネルの一貫性を保つ
  const { situation, schoolCharacteristics, otherContext } = await getFamilyProfile();
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
      // 対象者（role）に紐づく既存の想定問答を候補として渡し、この会話で出た
      // 質問・回答が既存のどの質問に対応するか、模範解答・面接官への印象を
      // 更新する価値があるかをAI自身に判定させる（examination#77要望3、#147）
      const existingQuestions = await queryQuestionsByTargetPerson(role);
      const { summary, questions } = await summarizeMockInterview({
        role,
        situation,
        schoolCharacteristics,
        history,
        existingQuestions,
      });
      await saveMockInterviewSummary({ role, situation, schoolCharacteristics, channel: "voice", summary, createdBy: email });
      // 想定問答バンクへの反映は付随的な処理のため、失敗してもサマリー自体の
      // 保存成功・終了レスポンス（{ saved: true }）は変えない
      try {
        await applyReconciliationResults(questions, role, existingQuestions);
      } catch (error) {
        console.error("Question bank reconciliation failed", error.message);
      }
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
