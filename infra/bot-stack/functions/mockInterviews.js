"use strict";

const crypto = require("crypto");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { FAMILY_SLUG } = require("./familyConfig");

const MOCK_INTERVIEWS_TABLE = "examination-mock-interviews";

const ddb = new DynamoDBClient({ region: "us-east-1" });

// 数往復もない短いセッション（誤って「面接練習」と送ってすぐ終了した等）まで
// 記録すると記録がノイズだらけになるため、ユーザーの発言が1件も無いセッションは
// サマリー化・保存の対象外とする（examination#93）
function hasMeaningfulContent(history) {
  return Array.isArray(history) && history.some((message) => message.role === "user");
}

async function saveMockInterviewSummary({ role, situation, schoolCharacteristics, channel, summary, createdBy }) {
  const sessionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await ddb.send(
    new PutItemCommand({
      TableName: MOCK_INTERVIEWS_TABLE,
      Item: {
        familySlug: { S: FAMILY_SLUG },
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

module.exports = { hasMeaningfulContent, saveMockInterviewSummary };
