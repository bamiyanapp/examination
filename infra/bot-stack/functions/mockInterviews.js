"use strict";

const crypto = require("crypto");
const { DynamoDBClient, PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");

const MOCK_INTERVIEWS_TABLE = "examination-mock-interviews";

const ddb = new DynamoDBClient({ region: "us-east-1" });

// familySlugは呼び出し元が認証情報から解決した値を渡す（複数家族対応、examination#44・#241）

// 数往復もない短いセッション（誤って「面接練習」と送ってすぐ終了した等）まで
// 記録すると記録がノイズだらけになるため、ユーザーの発言が1件も無いセッションは
// サマリー化・保存の対象外とする（examination#93）
function hasMeaningfulContent(history) {
  return Array.isArray(history) && history.some((message) => message.role === "user");
}

async function saveMockInterviewSummary({ familySlug, role, situation, schoolCharacteristics, channel, summary, createdBy }) {
  const sessionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await ddb.send(
    new PutItemCommand({
      TableName: MOCK_INTERVIEWS_TABLE,
      Item: {
        familySlug: { S: familySlug },
        sessionId: { S: sessionId },
        role: { S: role },
        situation: { S: situation },
        schoolCharacteristics: { S: schoolCharacteristics || "" },
        channel: { S: channel },
        summary: { S: summary },
        createdBy: { S: createdBy },
        createdAt: { S: new Date().toISOString() },
      },
    })
  );
  return sessionId;
}

function toSummary(item) {
  return {
    sessionId: item.sessionId?.S || "",
    role: item.role?.S || "",
    situation: item.situation?.S || "",
    schoolCharacteristics: item.schoolCharacteristics?.S || "",
    channel: item.channel?.S || "",
    summary: item.summary?.S || "",
    createdAt: item.createdAt?.S || "",
  };
}

// 模擬面接記録の一覧取得（examination#103）。app/mock-interviews/がブラウザから
// 直接呼ぶ読み取り専用API。新しい記録ほど先に表示したいので降順で返す
async function listMockInterviewSummaries(familySlug) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: MOCK_INTERVIEWS_TABLE,
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: familySlug } },
      ScanIndexForward: false,
    })
  );
  return (result.Items || []).map(toSummary);
}

module.exports = { hasMeaningfulContent, saveMockInterviewSummary, listMockInterviewSummaries };
