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
        // チャンクをBufferのまま集め、レスポンス完了後に一度だけUTF-8デコードする。
        // res.on("data")のchunkはBufferであり、"data += chunk"は暗黙にchunkごと
        // toString()（UTF-8）してしまうため、日本語等のマルチバイト文字がチャンク
        // 境界で分割された場合に文字化け（U+FFFD置換文字）を起こす既知の不具合を避ける
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const data = Buffer.concat(chunks).toString("utf-8");
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

// 事前登録済みの想定問答（examination-interview-questionsテーブル、対象者で絞込み済み）
// を練習の質問候補として組み込む（examination#207）。AIが完全に自由に質問を生成する
// 方式（examination#76）に加え、既存の想定問答バンクをまず踏まえた上で、そこに無い
// 新しい追加質問もできるようにレベルアップする
function formatExistingQuestionsForPractice(existingQuestions) {
  if (!existingQuestions || existingQuestions.length === 0) return "";
  const lines = existingQuestions
    .map((q) => `- ${q.question}${q.answer ? `（想定回答: ${q.answer}）` : ""}`)
    .join("\n");
  return (
    "質問は、まず次の事前登録済みの想定問答を中心に（言い回しを変えても構いません、" +
    "順不同で構いません）聞いてください。すべて聞き終えた場合や、相手の回答を深掘り" +
    "する中で自然に話題が広がった場合は、次の想定問答一覧には無い新しい追加質問もして" +
    "ください。\n" +
    lines +
    "\n\n"
  );
}

function buildSystemPrompt({ role, situation, schoolCharacteristics, otherContext, existingQuestions }) {
  const roleDescription = ROLE_DESCRIPTIONS[role];
  const characteristicsText = schoolCharacteristics
    ? `志望先の特色は次の通りです。${schoolCharacteristics}。これを踏まえた質問も交えてください。`
    : "";
  // 志望先の特色欄では拾いきれない情報（家族情報等）を補う自由記述欄（examination#76）
  const otherContextText = otherContext ? `その他、踏まえるべき前提情報は次の通りです。${otherContext}。` : "";
  const existingQuestionsText = formatExistingQuestionsForPractice(existingQuestions);
  return (
    `あなたは${situation}の面接官です。相手は` +
    roleDescription +
    "です。" +
    characteristicsText +
    otherContextText +
    "一度に1つだけ質問してください。相手の回答に対しては、良かった点や、より良い模範解答・" +
    "具体的な改善ポイントを示すフィードバックをしてから、次の一手を決めてください。" +
    "相手の回答が具体的で十分に掘り下げられている場合は、新しい話題の質問に進んでください。" +
    "一方、回答が抽象的だったり具体的なエピソードに欠ける場合は、新しい話題に移る代わりに、" +
    "実際の面接官がするように同じ話題を掘り下げる追加質問（例:「具体的にどんな場面で" +
    "そう感じましたか？」）をしても構いません。ただし同じ話題への深掘りは続けて2回までとし、" +
    "それ以降は新しい話題の質問に進んでください。" +
    (existingQuestionsText ||
      "質問は面接でよく聞かれる内容（志望動機、家庭の様子、本人の性格や好きなこと等）から" +
        "選んでください。") +
    "まだ相手の回答が無い最初のターンでは、フィードバックは不要です。\n\n" +
    "出力は必ず次のJSON形式のみとし、他の文章を含めないでください。\n" +
    '{"voice": "音声で読み上げる自然な話し言葉。記号や箇条書きは使わず簡潔に。", ' +
    '"text": "チャットで読む用の詳しい内容。模範解答や改善ポイントを具体的に含めてよい。"}\n\n' +
    "voice・textのどちらも、（該当する場合の）フィードバックと次の質問の両方を含めてください。"
  );
}

// フィードバック＋次の質問という複数文を1つのJSON文字列値に収めると、Geminiが
// 段落区切りとして「\n」ではなく生の改行文字をそのまま出力することがあり、
// 通常のJSON.parseでは失敗する。文字列リテラル内にいる間だけ改行等の制御文字を
// エスケープしてから渡すことで、この頻発するケースを救う
function escapeControlCharsInJsonStrings(raw) {
  let result = "";
  let inString = false;
  let escapedNext = false;
  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }
    if (escapedNext) {
      result += ch;
      escapedNext = false;
    } else if (ch === "\\") {
      result += ch;
      escapedNext = true;
    } else if (ch === '"') {
      result += ch;
      inString = false;
    } else if (ch === "\n") {
      result += "\\n";
    } else if (ch === "\r") {
      result += "\\r";
    } else if (ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
  }
  return result;
}

// buildSystemPromptの指示に従いGeminiが返す二形式（voice: 音声用の簡潔な話し言葉、
// text: チャット表示用の詳しい内容）のJSONをパースする（examination#89）。
// 音声で読み上げる内容とLINE/チャットで表示する内容は最適な情報量が異なるため、
// 1回のGemini呼び出しで両方を生成させ、呼び出し側（voiceChat.js/lineWebhook.js）が
// チャネルに応じて使い分ける。Geminiが厳密なJSON以外を返した場合は、生テキストを
// 両方にフォールバックさせ、致命的なエラーにしない
function parseDualReply(rawText) {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonText = escapeControlCharsInJsonStrings(jsonMatch ? jsonMatch[0] : rawText);
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.voice === "string" && typeof parsed.text === "string") {
      return { voice: parsed.voice, text: parsed.text };
    }
  } catch {
    // フォールバックへ
  }
  return { voice: rawText, text: rawText };
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

// 練習セッション終了時、会話履歴を振り返って模擬面接記録のサマリーを生成する
// （examination#93）。既存の記録フォーマット（knowledge/education/mock-interviews.md）
// を踏襲し「よかった点」「改善が必要な点」「次回までのアクション」の3項目でまとめる。
// このサマリーは音声で読み上げず記録として保存するだけのため、buildSystemPrompt/
// parseDualReplyのような二形式JSON出力は不要（読みやすさのため箇条書きも許容する）。
//
// あわせて、想定問答バンク（examination-interview-questions）との照合・模範解答/
// 面接官への印象の生成もこの1回のGemini呼び出しに含める（examination#77要望3、
// examination#147）。練習モード自体は引き続きAIが自由に質問を生成する方式
// （examination#76）のままで、出題内容とテーブルの行は元々紐付いていないため、
// 練習終了時にまとめて「今回の会話は既存のどの質問に対応するか」をAI自身に
// 判定させる。別のGemini呼び出しを新設すると1日あたりのAI API上限
// （aiApiLimit.js）を追加消費してしまうため、既存のサマリー生成と統合し
// 呼び出し回数を増やさない
function buildSummaryPrompt({ role, situation, schoolCharacteristics, history, existingQuestions }) {
  const roleDescription = ROLE_DESCRIPTIONS[role] || role;
  const transcript = (history || [])
    .map((message) => `${message.role === "user" ? "回答者" : "面接官"}: ${message.content}`)
    .join("\n");
  const characteristicsText = schoolCharacteristics ? `志望先の特色: ${schoolCharacteristics}。` : "";
  const questionsList = (existingQuestions || [])
    .map((q) => `- id: ${q.questionId} / 質問: ${q.question}${q.modelAnswer ? ` / 既存の模範解答: ${q.modelAnswer}` : ""}`)
    .join("\n");
  return (
    `以下は${situation}の練習会話です。相手は${roleDescription}です。${characteristicsText}` +
    "この会話を振り返り、模擬面接の記録として「よかった点」「改善が必要な点」「次回までのアクション」の" +
    "3項目で日本語のサマリーを作成してください。各項目は「・」で始まる箇条書きで、実際の発言内容に" +
    "具体的に触れながらまとめてください。\n\n" +
    "あわせて、この会話で実際にやり取りされた質問と回答のペアを抽出し、それぞれについて次を行ってください。\n" +
    "1. 下記の「既存の質問一覧」の中に同じ話題の質問が無いか確認する（あればそのidをmatchedQuestionIdとする。無ければnull）\n" +
    "2. 回答者の回答をもとに、より良い模範解答と、その回答が面接官にどう評価されるか（面接官への印象）を生成する\n" +
    "3. matchedQuestionIdがある場合、生成した模範解答が既存の模範解答より明らかに優れている場合のみ" +
    "shouldUpdateModelAnswerをtrueにする（大差が無い場合はfalseにし、既存の模範解答を変更しない）\n" +
    "4. 雑談や、同じ話題を掘り下げる追加質問（1つの話題を複数ターンに分けて深掘りしたもの）は1件にまとめ、" +
    "最も内容が深まった回答を採用する。想定問答バンクに残す価値のある独立した質問と判断した場合のみ" +
    "shouldPersistをtrueにする（世間話等、質問と呼べないやり取りはshouldPersistをfalseにするか抽出しない）\n\n" +
    "既存の質問一覧（対象者: " +
    roleDescription +
    "）:\n" +
    (questionsList || "（該当なし）") +
    "\n\n会話内容:\n" +
    transcript +
    "\n\n出力は必ず次のJSON形式のみとし、他の文章を含めないでください。summaryは上記3項目の箇条書き文字列、" +
    "questionsは抽出した質問ごとのオブジェクトの配列です（該当が無ければ空配列）。\n" +
    '{"summary": "・...", "questions": [{"matchedQuestionId": "IDまたはnull", "question": "質問文（matchedQuestionIdがnullの場合のみ使用）", ' +
    '"answer": "回答内容", "modelAnswer": "模範解答", "impression": "面接官への印象", "shouldPersist": true, "shouldUpdateModelAnswer": true}]}'
  );
}

// buildSummaryPromptの出力（{summary, questions}のJSON）をパースする。questions配列の
// 各要素は個別にバリデーションし、不正な要素は取り除く（1件の形式不備で全体を
// 諦めるとせっかくのsummaryも失われるため）。JSON自体の抽出・改行エスケープは
// parseDualReplyと同じ方針を再利用する
function parseReconciliationReply(rawText) {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const jsonText = escapeControlCharsInJsonStrings(jsonMatch ? jsonMatch[0] : rawText);
    const parsed = JSON.parse(jsonText);
    const summary = typeof parsed.summary === "string" ? parsed.summary : rawText;
    const questions = Array.isArray(parsed.questions)
      ? parsed.questions.filter(
          (q) => q && typeof q.answer === "string" && typeof q.modelAnswer === "string" && typeof q.impression === "string"
        )
      : [];
    return { summary, questions };
  } catch {
    return { summary: rawText, questions: [] };
  }
}

async function summarizeMockInterview({ role, situation, schoolCharacteristics, history, existingQuestions }) {
  const prompt = buildSummaryPrompt({ role, situation, schoolCharacteristics, history, existingQuestions });
  const raw = await callGemini([{ role: "user", content: prompt }]);
  return parseReconciliationReply(raw);
}

module.exports = {
  postJson,
  ROLE_DESCRIPTIONS,
  DEFAULT_SITUATION,
  sanitizeFreeText,
  buildSystemPrompt,
  callGemini,
  parseDualReply,
  summarizeMockInterview,
};
