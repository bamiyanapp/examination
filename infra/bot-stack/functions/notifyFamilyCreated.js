"use strict";

const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");
const { postJson } = require("./geminiConversation");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const LINE_LINKS_TABLE = "examination-line-links";

const ddb = new DynamoDBClient({ region: "us-east-1" });

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// examination-line-linksはlineUserId(PK)→emailの向きでしか引けないため、
// 管理用アカウントのemailからlineUserIdを引くにはScan＋FilterExpressionを使う
// （examination#259。テーブル規模は小さいためGSI追加は行わない）
async function findLineUserIdByEmail(email) {
  const result = await ddb.send(
    new ScanCommand({
      TableName: LINE_LINKS_TABLE,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": { S: email } },
    })
  );
  const item = (result.Items || [])[0];
  return (item && item.lineUserId && item.lineUserId.S) || null;
}

function pushLineMessage(lineUserId, text) {
  return postJson(
    "api.line.me",
    "/v2/bot/message/push",
    { Authorization: `Bearer ${config.lineChannelAccessToken}` },
    { to: lineUserId, messages: [{ type: "text", text }] }
  );
}

// 新しい家族が登録された際、サイト運営者（管理用Googleアカウント、
// config.adminNotifyEmail）へLINEで通知する内部API（examination#258・#259）。
// site-stack（checkAuth.jsのcreateFamily）が家族作成成功後に呼ぶ。site-stackと
// bot-stackは別Serverless serviceのため、共有シークレット（X-Internal-Secret
// ヘッダー）で呼び出し元を検証する。管理用アカウントがまだLINE連携していない
// 場合は通知をスキップする（呼び出し元の家族作成自体は失敗させない方針のため
// エラーにはしない、examination#259のIssue本文参照）
exports.handler = async (event) => {
  if (event.requestContext?.http?.method !== "POST") {
    return jsonResponse(405, { error: "method not allowed" });
  }
  const providedSecret = event.headers?.["x-internal-secret"];
  if (!config.internalApiSecret || providedSecret !== config.internalApiSecret) {
    return jsonResponse(403, { error: "forbidden" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "invalid JSON" });
  }
  const email = typeof payload.email === "string" ? payload.email : "";
  const familyName = typeof payload.familyName === "string" ? payload.familyName : "";
  if (!email || !familyName) {
    return jsonResponse(400, { error: "email, familyNameは必須です" });
  }

  try {
    const lineUserId = await findLineUserIdByEmail(config.adminNotifyEmail);
    if (!lineUserId) {
      console.warn("Admin notify email is not linked to a LINE account", config.adminNotifyEmail);
      return jsonResponse(200, { notified: false });
    }
    await pushLineMessage(lineUserId, `新しい家族が登録されました\n家族名: ${familyName}\nメール: ${email}`);
    return jsonResponse(200, { notified: true });
  } catch (error) {
    console.error("Failed to send family-created notification", error.message);
    return jsonResponse(200, { notified: false });
  }
};
