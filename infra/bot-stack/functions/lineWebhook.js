"use strict";

const crypto = require("crypto");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
} = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");
// 面接練習の会話ロジックはvoiceChat.js（音声対話）と共通化している（examination#76）
const {
  postJson,
  buildSystemPrompt,
  callGemini,
  parseDualReply,
  summarizeMockInterview,
} = require("./geminiConversation");
const { hasMeaningfulContent, saveMockInterviewSummary } = require("./mockInterviews");
const { getFamilyProfile } = require("./familyProfile");
const { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage } = require("./aiApiLimit");

const { FAMILY_SLUG } = require("./familyConfig");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";
const BOT_SESSIONS_TABLE = "examination-bot-sessions";
const LINE_LINKS_TABLE = "examination-line-links";
const SESSION_TTL_SECONDS = 60 * 60 * 24;

// site-stackが所有するテーブル名（examination#49、クロススタックアクセス）。
// bot-stackはus-east-1に統一済み（examination#63）のため、site-stackのテーブルも
// 同一リージョンにあり、クライアントは1つで済む
const LINE_LINK_CODES_TABLE = "examination-line-link-codes";
const ALLOWED_EMAILS_TABLE = "examination-allowed-emails";

const ddb = new DynamoDBClient({ region: "us-east-1" });

function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", config.lineChannelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function replyMessage(replyToken, text) {
  return postJson(
    "api.line.me",
    "/v2/bot/message/reply",
    { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    { replyToken, messages: [{ type: "text", text }] }
  );
}

async function getSession(lineUserId) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: BOT_SESSIONS_TABLE, Key: { lineUserId: { S: lineUserId } } })
  );
  if (!result.Item) return { mode: "idle" };
  return {
    mode: result.Item.mode?.S || "idle",
    draftQuestion: result.Item.draftQuestion?.S ? JSON.parse(result.Item.draftQuestion.S) : undefined,
    // 面接練習の会話状態（role/situation/schoolCharacteristics/history、examination#76）
    practiceState: result.Item.practiceState?.S ? JSON.parse(result.Item.practiceState.S) : undefined,
  };
}

async function saveSession(lineUserId, session) {
  const item = {
    lineUserId: { S: lineUserId },
    mode: { S: session.mode },
    expiresAt: { N: String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS) },
  };
  if (session.draftQuestion) item.draftQuestion = { S: JSON.stringify(session.draftQuestion) };
  if (session.practiceState) item.practiceState = { S: JSON.stringify(session.practiceState) };
  await ddb.send(new PutItemCommand({ TableName: BOT_SESSIONS_TABLE, Item: item }));
}

async function clearSession(lineUserId) {
  await ddb.send(new DeleteItemCommand({ TableName: BOT_SESSIONS_TABLE, Key: { lineUserId: { S: lineUserId } } }));
}

// LINEアカウントに紐付いたメールアドレスを取得する（examination#49）。未連携ならnull
async function getLinkedEmail(lineUserId) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: LINE_LINKS_TABLE, Key: { lineUserId: { S: lineUserId } } })
  );
  return result.Item ? result.Item.email.S : null;
}

async function linkLineAccount(lineUserId, email) {
  await ddb.send(
    new PutItemCommand({
      TableName: LINE_LINKS_TABLE,
      Item: {
        lineUserId: { S: lineUserId },
        email: { S: email },
        linkedAt: { S: new Date().toISOString() },
      },
    })
  );
}

// サイト（checkAuth.js）が発行したワンタイムコードを検証・消費する。有効なら紐付け先の
// メールアドレスを返し、コードは使い切りのため削除する。無効・期限切れならnullを返す
async function consumeLinkCode(code) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: LINE_LINK_CODES_TABLE, Key: { code: { S: code } } })
  );
  if (!result.Item) return null;
  const expiresAt = Number(result.Item.expiresAt?.N || 0);
  await ddb.send(new DeleteItemCommand({ TableName: LINE_LINK_CODES_TABLE, Key: { code: { S: code } } }));
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;
  return result.Item.email.S;
}

// site-stackのexamination-allowed-emailsをクロススタックで参照する（examination#49）。
// 連携済みでもallowlistから削除されていれば毎回ここでブロックされる
async function isEmailAllowed(email) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: ALLOWED_EMAILS_TABLE, Key: { email: { S: email } } })
  );
  return Boolean(result.Item);
}

// categoryは「本人面接」「父の保護者面接」「母の保護者面接」のいずれかとして
// Geminiに抽出させている（handleRegisterExtract参照）。対象者（examination#77）は
// このcategoryから機械的に導出し、AIに別途出力させて食い違うリスクを避ける
const CATEGORY_TARGET_PERSON = {
  本人面接: "本人",
  父の保護者面接: "父",
  母の保護者面接: "母",
};

function deriveTargetPerson(category) {
  return CATEGORY_TARGET_PERSON[category] || "";
}

async function saveQuestion({ category, question, answer, createdBy }) {
  const questionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await ddb.send(
    new PutItemCommand({
      TableName: INTERVIEW_QUESTIONS_TABLE,
      Item: {
        familySlug: { S: FAMILY_SLUG },
        questionId: { S: questionId },
        category: { S: category },
        targetPerson: { S: deriveTargetPerson(category) },
        question: { S: question },
        answer: { S: answer },
        createdBy: { S: createdBy },
        createdAt: { S: new Date().toISOString() },
      },
    })
  );
  return questionId;
}

function isYes(text) {
  return /^(はい|OK|ok|うん|お願いします?)$/i.test(text.trim());
}

function isNo(text) {
  return /^(いいえ|no|NO|キャンセル|やめる)$/i.test(text.trim());
}

// ロール選択の返答テキスト -> geminiConversation.ROLE_DESCRIPTIONSのキー（examination#60、#76）
const ROLE_ALIASES = {
  本人: "本人",
  父: "父",
  父親: "父",
  お父さん: "父",
  母: "母",
  母親: "母",
  お母さん: "母",
};

// 面接練習を終了する合図（examination#76: マルチターン会話方式のため、以前のような
// 1往復で自動終了する設計ではなく、明示的な終了コマンドが必要になった）
const PRACTICE_EXIT_PATTERN = /^(終了|やめる|やめます|おわり|終わり)$/;

async function handlePracticeAskRole(lineUserId) {
  await saveSession(lineUserId, { mode: "practice_select_role" });
  return "誰の面接練習をしますか？「本人」「父」「母」のいずれかを送ってください。";
}

// シチュエーション・志望先の特色・その他前提情報はプロフィール編集画面
// （app/profile-edit/）で編集・保存された値をサーバー側で参照する
// （examination#125、シチュエーションはexamination#135）。以前はここでLINEから
// 追加で自由入力させていたが、練習の度に入力し直すものではないため撤去した。
// voiceChat.js（音声対話ページ）とも同じ単一の情報源を参照することで両チャネルの
// 一貫性を保つ。ロール（本人/父/母）は練習のたびに変わり得るため引き続きここで選ぶ
async function handlePracticeRoleSelected(lineUserId, text, email) {
  const role = ROLE_ALIASES[text.trim()];
  if (!role) {
    return "「本人」「父」「母」のいずれかを送ってください。";
  }
  const { situation, schoolCharacteristics, otherContext } = await getFamilyProfile();
  const practiceState = { role, situation, schoolCharacteristics, otherContext };
  // AI API呼び出しの1日あたりの上限チェック（examination#124）
  if (!(await incrementAndCheckAiApiUsage(email))) {
    await clearSession(lineUserId);
    return `本日のAI応答生成の上限（${AI_API_DAILY_LIMIT}回）に達しました。日付が変わってからお試しください。`;
  }
  let rawReply;
  try {
    rawReply = await callGemini([{ role: "system", content: buildSystemPrompt(practiceState) }]);
  } catch (error) {
    console.error("Gemini call failed (practice start)", error.message);
    await clearSession(lineUserId);
    return "面接練習の開始に失敗しました。もう一度「面接練習」と送ってやり直してください。";
  }
  // LINEはテキスト表示のみのため、模範解答・改善ポイントを含む詳しいtext版を使う
  // （examination#89。音声対話ページはvoice版を使う、voiceChat.js参照）
  const { text: reply } = parseDualReply(rawReply);
  await saveSession(lineUserId, {
    mode: "practice",
    practiceState: { ...practiceState, history: [{ role: "assistant", content: reply }] },
  });
  return `${reply}\n\n（練習を終えるには「終了」と送ってください）`;
}

async function handlePracticeTurn(lineUserId, session, text, email) {
  if (PRACTICE_EXIT_PATTERN.test(text.trim())) {
    const practiceState = session.practiceState;
    await clearSession(lineUserId);
    if (!hasMeaningfulContent(practiceState.history)) {
      return "面接練習を終了しました。お疲れさまでした。";
    }
    // 会話の振り返り（examination#93）。失敗しても練習の終了自体はブロックしない。
    // サマリー生成もGemini呼び出しの1つとして上限にカウントする（examination#124）
    if (!(await incrementAndCheckAiApiUsage(email))) {
      console.warn("AI API daily limit exceeded (line practice end)", email);
      return "面接練習を終了しました。振り返りの記録には失敗しましたが、お疲れさまでした。";
    }
    try {
      const summary = await summarizeMockInterview(practiceState);
      await saveMockInterviewSummary({ ...practiceState, channel: "line", summary, createdBy: lineUserId });
      return "面接練習を終了しました。今回の振り返りを記録しました。お疲れさまでした。";
    } catch (error) {
      console.error("Mock interview summary failed", error.message);
      return "面接練習を終了しました。振り返りの記録には失敗しましたが、お疲れさまでした。";
    }
  }
  // AI API呼び出しの1日あたりの上限チェック（examination#124）
  if (!(await incrementAndCheckAiApiUsage(email))) {
    return `本日のAI応答生成の上限（${AI_API_DAILY_LIMIT}回）に達しました。日付が変わってからお試しください。`;
  }
  const practiceState = session.practiceState;
  const messages = [
    { role: "system", content: buildSystemPrompt(practiceState) },
    ...practiceState.history,
    { role: "user", content: text },
  ];
  let rawReply;
  try {
    rawReply = await callGemini(messages);
  } catch (error) {
    console.error("Gemini call failed (practice turn)", error.message);
    return "フィードバックの生成に失敗しました。もう一度お試しください。";
  }
  const { text: reply } = parseDualReply(rawReply);
  const updatedHistory = [
    ...practiceState.history,
    { role: "user", content: text },
    { role: "assistant", content: reply },
  ];
  await saveSession(lineUserId, { mode: "practice", practiceState: { ...practiceState, history: updatedHistory } });
  return reply;
}

async function handleRegisterStart(lineUserId) {
  await saveSession(lineUserId, { mode: "register" });
  return "登録したい想定問答を自由な文章で教えてください。（例: 父の面接で「志望理由は？」と聞かれたら「〜」と答える予定）";
}

async function handleRegisterExtract(lineUserId, freeText, createdBy, email) {
  // AI API呼び出しの1日あたりの上限チェック（examination#124）
  if (!(await incrementAndCheckAiApiUsage(email))) {
    await clearSession(lineUserId);
    return `本日のAI応答生成の上限（${AI_API_DAILY_LIMIT}回）に達しました。日付が変わってからお試しください。`;
  }
  const prompt =
    "次の文章から、小学校受験の面接想定問答を抽出してください。" +
    '厳密なJSON形式（{"category": "本人面接" または "父の保護者面接" または "母の保護者面接", "question": "質問文", "answer": "回答文"}）' +
    "のみを出力してください。他の文章は含めないでください。\n\n" +
    `文章: ${freeText}`;
  let draft;
  try {
    const raw = await callGemini([{ role: "user", content: prompt }]);
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    draft = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    if (!draft.category || !draft.question || !draft.answer) {
      throw new Error("missing fields");
    }
  } catch (error) {
    console.error("Gemini extraction failed (register)", error.message);
    await clearSession(lineUserId);
    return "うまく読み取れませんでした。もう一度「質問を登録」からやり直してください。";
  }
  await saveSession(lineUserId, { mode: "register_confirm", draftQuestion: { ...draft, createdBy } });
  return (
    `以下の内容で登録します。よろしいですか？（はい/いいえ）\n\n` +
    `分類: ${draft.category}\n質問: ${draft.question}\n回答: ${draft.answer}`
  );
}

async function handleRegisterConfirm(lineUserId, session, text) {
  if (isYes(text)) {
    await saveQuestion(session.draftQuestion);
    await clearSession(lineUserId);
    return "登録しました。「面接練習」でこの質問も出題されるようになります。";
  }
  if (isNo(text)) {
    await clearSession(lineUserId);
    return "登録をキャンセルしました。";
  }
  return "「はい」か「いいえ」で答えてください。";
}

const LINK_CODE_PATTERN = /^\d{6}$/;

// 未連携のLINEアカウントからのメッセージを処理する（examination#49）。6桁の数字が
// 送られてきたらワンタイムコードとして検証し、成功すればGoogleアカウントと紐付ける
async function handleUnlinkedMessage(lineUserId, text) {
  if (LINK_CODE_PATTERN.test(text.trim())) {
    const email = await consumeLinkCode(text.trim());
    if (!email) {
      return "コードが無効か期限切れです。サイトの「設定 → LINE連携」でもう一度発行してください。";
    }
    if (!(await isEmailAllowed(email))) {
      return "このアカウントはサイトの閲覧許可がありません。管理者に確認してください。";
    }
    await linkLineAccount(lineUserId, email);
    return "連携が完了しました。「面接練習」または「質問を登録」と送ってください。";
  }
  return (
    "このLINEアカウントはまだ連携されていません。" +
    "サイトの「設定 → LINE連携」でワンタイムコードを発行し、6桁の数字をこのトークに送ってください。"
  );
}

async function handleTextMessage(lineUserId, text) {
  const linkedEmail = await getLinkedEmail(lineUserId);
  if (!linkedEmail) {
    return handleUnlinkedMessage(lineUserId, text);
  }
  if (!(await isEmailAllowed(linkedEmail))) {
    return "このアカウントはサイトの閲覧許可がありません。管理者に確認してください。";
  }

  const session = await getSession(lineUserId);

  if (text.includes("面接練習")) {
    return handlePracticeAskRole(lineUserId);
  }
  if (text.includes("質問を登録") || text.includes("質問登録")) {
    return handleRegisterStart(lineUserId);
  }
  if (session.mode === "practice_select_role") {
    return handlePracticeRoleSelected(lineUserId, text, linkedEmail);
  }
  if (session.mode === "practice") {
    return handlePracticeTurn(lineUserId, session, text, linkedEmail);
  }
  if (session.mode === "register") {
    return handleRegisterExtract(lineUserId, text, lineUserId, linkedEmail);
  }
  if (session.mode === "register_confirm") {
    return handleRegisterConfirm(lineUserId, session, text);
  }
  return (
    "「面接練習」と送ると想定問答を出題します。\n" + "「質問を登録」と送ると新しい想定問答を登録できます。"
  );
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "POST") {
    return { statusCode: 405, body: "method not allowed" };
  }

  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf-8") : event.body || "";
  const signature = event.headers?.["x-line-signature"];
  if (!verifySignature(rawBody, signature)) {
    console.warn("invalid LINE signature");
    return { statusCode: 403, body: "invalid signature" };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (error) {
    return { statusCode: 400, body: "invalid JSON" };
  }

  for (const lineEvent of payload.events || []) {
    if (lineEvent.type !== "message" || lineEvent.message?.type !== "text") continue;
    const lineUserId = lineEvent.source?.userId;
    const replyToken = lineEvent.replyToken;
    if (!lineUserId || !replyToken) continue;

    try {
      const replyText = await handleTextMessage(lineUserId, lineEvent.message.text.trim());
      await replyMessage(replyToken, replyText);
    } catch (error) {
      console.error("Failed to handle LINE event", error);
      try {
        await replyMessage(replyToken, "エラーが発生しました。もう一度お試しください。");
      } catch (replyError) {
        console.error("Failed to send error reply", replyError);
      }
    }
  }

  return { statusCode: 200, body: "OK" };
};
