"use strict";

const { DynamoDBClient, UpdateItemCommand } = require("@aws-sdk/client-dynamodb");

const AI_API_ISSUANCE_TABLE = "examination-ai-api-issuance";
// 誤操作・アカウント乗っ取り等でGemini API呼び出しが想定外に増えるリスクを抑えるための
// 1日あたりの呼び出し上限（examination#124）。/_voice-token発行回数の上限
// （examination#69、site-stack/checkAuth.js）とは別に、実際のGemini呼び出し回数
// そのものをアカウント（email）単位で制限する。音声対話ページ（voiceChat.js）・
// LINE bot（lineWebhook.js）の両チャネルから同じGoogleアカウント単位でカウントを共有する
const AI_API_DAILY_LIMIT = 100;

// bot-stackは実行リージョンをus-east-1に統一済み（examination#63）
const ddb = new DynamoDBClient({ region: "us-east-1" });

function todayDateKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// メールアドレス×当日日付のAI API呼び出し回数をアトミックにインクリメントし、上限を
// 超えていないか確認する。site-stack/checkAuth.jsのincrementAndCheckVoiceTokenIssuance
// と同じ、UpdateItem（ADD + ConditionExpression）による単一リクエストでの
// 読み取り・条件判定・更新でレースコンディションを避ける
async function incrementAndCheckAiApiUsage(email) {
  const key = `${email}#${todayDateKey()}`;
  // 日付境界をまたいだ集計漏れを避けるため、TTLは1日分に余裕(1時間)を持たせる
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 25;
  try {
    await ddb.send(
      new UpdateItemCommand({
        TableName: AI_API_ISSUANCE_TABLE,
        Key: { emailDate: { S: key } },
        UpdateExpression: "ADD #count :one SET expiresAt = :expiresAt",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":one": { N: "1" },
          ":limit": { N: String(AI_API_DAILY_LIMIT) },
          ":expiresAt": { N: String(expiresAt) },
        },
      })
    );
    return true;
  } catch (error) {
    if (error.name === "ConditionalCheckFailedException") {
      return false;
    }
    throw error;
  }
}

module.exports = { AI_API_DAILY_LIMIT, incrementAndCheckAiApiUsage };
