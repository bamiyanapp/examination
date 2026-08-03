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

function buildSystemPrompt({ role, situation, schoolCharacteristics, otherContext }) {
  const roleDescription = ROLE_DESCRIPTIONS[role];
  const characteristicsText = schoolCharacteristics
    ? `志望先の特色は次の通りです。${schoolCharacteristics}。これを踏まえた質問も交えてください。`
    : "";
  // 志望先の特色欄では拾いきれない情報（家族情報等）を補う自由記述欄（examination#76）
  const otherContextText = otherContext ? `その他、踏まえるべき前提情報は次の通りです。${otherContext}。` : "";
  return (
    `あなたは${situation}の面接官です。相手は` +
    roleDescription +
    "です。" +
    characteristicsText +
    otherContextText +
    "一度に1つだけ質問してください。相手の回答に対しては、良かった点や、より良い模範解答・" +
    "具体的な改善ポイントを示すフィードバックをしてから、自然に次の質問へ進めてください。" +
    "質問は面接でよく聞かれる内容（志望動機、家庭の様子、本人の性格や好きなこと等）から" +
    "選んでください。まだ相手の回答が無い最初のターンでは、フィードバックは不要です。\n\n" +
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
// parseDualReplyのような二形式JSON出力は不要（読みやすさのため箇条書きも許容する）
function buildSummaryPrompt({ role, situation, schoolCharacteristics, history }) {
  const roleDescription = ROLE_DESCRIPTIONS[role] || role;
  const transcript = (history || [])
    .map((message) => `${message.role === "user" ? "回答者" : "面接官"}: ${message.content}`)
    .join("\n");
  const characteristicsText = schoolCharacteristics ? `志望先の特色: ${schoolCharacteristics}。` : "";
  return (
    `以下は${situation}の練習会話です。相手は${roleDescription}です。${characteristicsText}` +
    "この会話を振り返り、模擬面接の記録として「よかった点」「改善が必要な点」「次回までのアクション」の" +
    "3項目で日本語のサマリーを作成してください。各項目は「・」で始まる箇条書きで、実際の発言内容に" +
    "具体的に触れながらまとめてください。出力はこの3項目のみとし、前置き・後書きは不要です。\n\n" +
    `会話内容:\n${transcript}`
  );
}

async function summarizeMockInterview({ role, situation, schoolCharacteristics, history }) {
  const prompt = buildSummaryPrompt({ role, situation, schoolCharacteristics, history });
  return callGemini([{ role: "user", content: prompt }]);
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
