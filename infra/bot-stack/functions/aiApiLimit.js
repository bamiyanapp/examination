"use strict";

const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");
const { incrementAndCheckDailyLimit } = require("./dailyRateLimit"); // symlink先: dev-standards#165

const AI_API_ISSUANCE_TABLE = "examination-ai-api-issuance";
// 誤操作・アカウント乗っ取り等でGemini API呼び出しが想定外に増えるリスクを抑えるための
// 1日あたりの呼び出し上限（examination#124）。/_voice-token発行回数の上限
// （examination#69、site-stack/checkAuth.js）とは別に、実際のGemini呼び出し回数を
// アカウント（email）単位で制限する。音声対話ページ（voiceChat.js）・LINE bot
// （lineWebhook.js）の両チャネルから同じGoogleアカウント単位でカウントを共有する。
// カウント対象は会話のラリー（練習開始・各ターンの質問生成）のみで、練習終了時の
// サマリー生成・想定問答の登録抽出はラリーではないため対象外（examination#235）
const AI_API_DAILY_LIMIT = 100;

// bot-stackは実行リージョンをus-east-1に統一済み（examination#63）
const ddb = new DynamoDBClient({ region: "us-east-1" });

async function incrementAndCheckAiApiUsage(email) {
  return incrementAndCheckDailyLimit({
    ddb,
    UpdateItemCommand,
    tableName: AI_API_ISSUANCE_TABLE,
    keyAttribute: "emailDate",
    identifier: email,
    limit: AI_API_DAILY_LIMIT,
  });
}

module.exports = { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage };
