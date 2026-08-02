"use strict";

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { verifyBearerEmail } = require("./apiAuth");
const { FAMILY_SLUG } = require("./familyConfig");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";

const ddb = new DynamoDBClient({ region: "us-east-1" });

function jsonResponse(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function toQuestion(item) {
  return {
    questionId: item.questionId?.S || "",
    category: item.category?.S || "",
    targetPerson: item.targetPerson?.S || "",
    question: item.question?.S || "",
    answer: item.answer?.S || "",
    example: item.example?.S || "",
    impression: item.impression?.S || "",
    modelAnswer: item.modelAnswer?.S || "",
  };
}

// 想定問答の一覧取得API（examination#77）。本人/父/母を分けた複数ページではなく
// 1画面（app/interview-questions/）に統合して表示するため、familySlug配下の全件を返す
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;
  if (method !== "GET") {
    return jsonResponse(405, { error: "method not allowed" });
  }

  const email = await verifyBearerEmail(event);
  if (!email) {
    return jsonResponse(403, { error: "アクセスが許可されていません" });
  }

  const result = await ddb.send(
    new QueryCommand({
      TableName: INTERVIEW_QUESTIONS_TABLE,
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: FAMILY_SLUG } },
    })
  );

  const questions = (result.Items || []).map(toQuestion);
  return jsonResponse(200, { questions });
};
