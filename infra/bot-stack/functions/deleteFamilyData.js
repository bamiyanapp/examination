"use strict";

const { DynamoDBClient, DeleteItemCommand, QueryCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
// deploy時にscripts/generate-config.jsが生成する（gitには含めない。.gitignore参照）
const config = require("./configuration.json");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";
const MOCK_INTERVIEWS_TABLE = "examination-mock-interviews";
const FAMILY_PROFILE_TABLE = "examination-family-profile";
const LINE_LINKS_TABLE = "examination-line-links";

const ddb = new DynamoDBClient({ region: "us-east-1" });

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

// familySlug（PK）配下の全アイテムをQueryで取得し、1件ずつDeleteItemする
async function deleteAllItemsByFamilySlug(tableName, sortKeyName, familySlug) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: familySlug } },
    })
  );
  for (const item of result.Items || []) {
    await ddb.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: { familySlug: item.familySlug, [sortKeyName]: item[sortKeyName] },
      })
    );
  }
}

// examination-line-linksはlineUserId(PK)→emailの向きでしか引けないため、
// notifyFamilyCreated.jsのfindLineUserIdByEmailと同じくScan＋FilterExpressionで
// 対象emailの行を探す（examination#284。テーブル規模は小さいためGSI追加は行わない）
async function deleteLineLinkByEmail(email) {
  const result = await ddb.send(
    new ScanCommand({
      TableName: LINE_LINKS_TABLE,
      FilterExpression: "email = :email",
      ExpressionAttributeValues: { ":email": { S: email } },
    })
  );
  for (const item of result.Items || []) {
    await ddb.send(new DeleteItemCommand({ TableName: LINE_LINKS_TABLE, Key: { lineUserId: item.lineUserId } }));
  }
}

// 家族の退会（最後の1人が自分自身を削除する操作）に伴うデータ全削除（examination#284）。
// site-stack（checkAuth.jsのhandleAdminEmailsApi）がサーバー間で呼ぶ内部API。
// site-stackとbot-stackは別Serverless serviceのため、共有シークレット
// （X-Internal-Secretヘッダー）で呼び出し元を検証する。site-stack自身が所有する
// examination-allowed-emails・examination-familiesの削除はこのAPIの責務ではなく、
// 呼び出し元（checkAuth.js）がこのAPIの成功を確認した後に自分で行う
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
  const familySlug = typeof payload.familySlug === "string" ? payload.familySlug : "";
  const email = typeof payload.email === "string" ? payload.email : "";
  if (!familySlug) {
    return jsonResponse(400, { error: "familySlugは必須です" });
  }

  try {
    await deleteAllItemsByFamilySlug(INTERVIEW_QUESTIONS_TABLE, "questionId", familySlug);
    await deleteAllItemsByFamilySlug(MOCK_INTERVIEWS_TABLE, "sessionId", familySlug);
    await ddb.send(new DeleteItemCommand({ TableName: FAMILY_PROFILE_TABLE, Key: { familySlug: { S: familySlug } } }));
    if (email) {
      await deleteLineLinkByEmail(email);
    }
    return jsonResponse(200, { deleted: true });
  } catch (error) {
    console.error("Failed to delete family data", error.message);
    return jsonResponse(500, { error: "家族データの削除に失敗しました" });
  }
};
