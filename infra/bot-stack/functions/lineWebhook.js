"use strict";

const crypto = require("crypto");
const https = require("https");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
} = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";
const BOT_SESSIONS_TABLE = "examination-bot-sessions";
const LINE_LINKS_TABLE = "examination-line-links";
// 複数家族対応(examination#44)が実装されるまでは固定値として扱う
const FAMILY_SLUG = "chofu-suzuki";
const SESSION_TTL_SECONDS = 60 * 60 * 24;
// gemini-2.0-flashはGoogle側で廃止(404 NOT_FOUND)されたため後継モデルに変更した
// （examination#74）
const GEMINI_MODEL = "gemini-2.5-flash";

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

function replyMessage(replyToken, text) {
  return postJson(
    "api.line.me",
    "/v2/bot/message/reply",
    { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    { replyToken, messages: [{ type: "text", text }] }
  );
}

async function callGemini(prompt) {
  const response = await postJson(
    "generativelanguage.googleapis.com",
    `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`,
    {},
    { contents: [{ parts: [{ text: prompt }] }] }
  );
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error(`Gemini response missing text: ${JSON.stringify(response)}`);
  }
  return text;
}

async function getSession(lineUserId) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: BOT_SESSIONS_TABLE, Key: { lineUserId: { S: lineUserId } } })
  );
  if (!result.Item) return { mode: "idle" };
  return {
    mode: result.Item.mode?.S || "idle",
    currentQuestionId: result.Item.currentQuestionId?.S,
    currentQuestion: result.Item.currentQuestion?.S,
    currentAnswer: result.Item.currentAnswer?.S,
    draftQuestion: result.Item.draftQuestion?.S ? JSON.parse(result.Item.draftQuestion.S) : undefined,
  };
}

async function saveSession(lineUserId, session) {
  const item = {
    lineUserId: { S: lineUserId },
    mode: { S: session.mode },
    expiresAt: { N: String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS) },
  };
  if (session.currentQuestionId) item.currentQuestionId = { S: session.currentQuestionId };
  if (session.currentQuestion) item.currentQuestion = { S: session.currentQuestion };
  if (session.currentAnswer) item.currentAnswer = { S: session.currentAnswer };
  if (session.draftQuestion) item.draftQuestion = { S: JSON.stringify(session.draftQuestion) };
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

async function listQuestions() {
  const result = await ddb.send(
    new QueryCommand({
      TableName: INTERVIEW_QUESTIONS_TABLE,
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: FAMILY_SLUG } },
    })
  );
  return (result.Items || []).map((item) => ({
    questionId: item.questionId.S,
    category: item.category.S,
    question: item.question.S,
    answer: item.answer.S,
  }));
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

// ロール選択の返答テキスト -> DynamoDB上のcategory値（examination#60）
const ROLE_CATEGORIES = {
  本人: "本人面接",
  父: "父の保護者面接",
  父親: "父の保護者面接",
  お父さん: "父の保護者面接",
  母: "母の保護者面接",
  母親: "母の保護者面接",
  お母さん: "母の保護者面接",
};

async function handlePracticeAskRole(lineUserId) {
  await saveSession(lineUserId, { mode: "practice_select_role" });
  return "誰の面接練習をしますか？「本人」「父」「母」のいずれかを送ってください。";
}

async function handlePracticeRoleSelected(lineUserId, text) {
  const category = ROLE_CATEGORIES[text.trim()];
  if (!category) {
    return "「本人」「父」「母」のいずれかを送ってください。";
  }
  return handlePracticeStart(lineUserId, category);
}

async function handlePracticeStart(lineUserId, category) {
  const questions = (await listQuestions()).filter((q) => q.category === category);
  if (questions.length === 0) {
    return `「${category}」の想定問答がまだ登録されていません。「質問を登録」と送って追加してください。`;
  }
  const picked = questions[Math.floor(Math.random() * questions.length)];
  await saveSession(lineUserId, {
    mode: "practice",
    currentQuestionId: picked.questionId,
    currentQuestion: picked.question,
    currentAnswer: picked.answer,
  });
  return `【${picked.category}】\n${picked.question}\n\n回答してみてください。`;
}

async function handlePracticeAnswer(lineUserId, session, userAnswer) {
  const prompt =
    "あなたは小学校受験の面接官です。以下の想定問答と子どもの回答を読み、" +
    "良い点と改善点を親しみやすい口調で日本語で簡潔にフィードバックしてください。\n\n" +
    `質問: ${session.currentQuestion}\n模範解答例: ${session.currentAnswer}\n実際の回答: ${userAnswer}`;
  let feedback;
  try {
    feedback = await callGemini(prompt);
  } catch (error) {
    console.error("Gemini call failed (practice)", error.message);
    feedback = "フィードバックの生成に失敗しました。もう一度「面接練習」と送ってやり直してください。";
  }
  await clearSession(lineUserId);
  return `${feedback}\n\n続けるには「面接練習」と送ってください。`;
}

async function handleRegisterStart(lineUserId) {
  await saveSession(lineUserId, { mode: "register" });
  return "登録したい想定問答を自由な文章で教えてください。（例: 父の面接で「志望理由は？」と聞かれたら「〜」と答える予定）";
}

async function handleRegisterExtract(lineUserId, freeText, createdBy) {
  const prompt =
    "次の文章から、小学校受験の面接想定問答を抽出してください。" +
    '厳密なJSON形式（{"category": "本人面接" または "父の保護者面接" または "母の保護者面接", "question": "質問文", "answer": "回答文"}）' +
    "のみを出力してください。他の文章は含めないでください。\n\n" +
    `文章: ${freeText}`;
  let draft;
  try {
    const raw = await callGemini(prompt);
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
    return handlePracticeRoleSelected(lineUserId, text);
  }
  if (session.mode === "practice") {
    return handlePracticeAnswer(lineUserId, session, text);
  }
  if (session.mode === "register") {
    return handleRegisterExtract(lineUserId, text, lineUserId);
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
