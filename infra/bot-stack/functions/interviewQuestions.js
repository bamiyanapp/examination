"use strict";

const { DynamoDBClient, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { verifyBearerEmail } = require("./apiAuth");
const { FAMILY_SLUG } = require("./familyConfig");
const { createQuestion, updateQuestion } = require("./interviewQuestionsStore");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";
const MAX_FIELD_LENGTH = 2000;
const TARGET_PERSONS = ["本人", "父", "母"];

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

function sanitizeField(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_FIELD_LENGTH) : "";
}

// POST/PUTの入力共通のバリデーション。targetPerson/question/answerは必須、
// example/impression/modelAnswerは任意（examination#165）
function parseQuestionPayload(payload) {
  const targetPerson = sanitizeField(payload.targetPerson);
  const question = sanitizeField(payload.question);
  const answer = sanitizeField(payload.answer);
  if (!TARGET_PERSONS.includes(targetPerson)) {
    return { error: "targetPersonは本人・父・母のいずれかを指定してください" };
  }
  if (!question) {
    return { error: "questionは必須です" };
  }
  if (!answer) {
    return { error: "answerは必須です" };
  }
  return {
    fields: {
      targetPerson,
      question,
      answer,
      example: sanitizeField(payload.example),
      impression: sanitizeField(payload.impression),
      modelAnswer: sanitizeField(payload.modelAnswer),
    },
  };
}

// 想定問答の一覧取得・追加・編集API（examination#77、#165）。本人/父/母を
// 分けた複数ページではなく1画面（app/interview-questions/）に統合して扱う
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method;

  const email = await verifyBearerEmail(event);
  if (!email) {
    return jsonResponse(403, { error: "アクセスが許可されていません" });
  }

  if (method === "GET") {
    const result = await ddb.send(
      new QueryCommand({
        TableName: INTERVIEW_QUESTIONS_TABLE,
        KeyConditionExpression: "familySlug = :slug",
        ExpressionAttributeValues: { ":slug": { S: FAMILY_SLUG } },
      })
    );
    const questions = (result.Items || []).map(toQuestion);
    return jsonResponse(200, { questions });
  }

  if (method === "POST" || method === "PUT") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return jsonResponse(400, { error: "invalid JSON" });
    }

    if (method === "PUT") {
      const questionId = sanitizeField(payload.questionId);
      if (!questionId) {
        return jsonResponse(400, { error: "questionIdは必須です" });
      }
      const { error, fields } = parseQuestionPayload(payload);
      if (error) return jsonResponse(400, { error });
      const question = await updateQuestion({ questionId, ...fields });
      if (!question) {
        return jsonResponse(404, { error: "指定された質問が見つかりません" });
      }
      return jsonResponse(200, { question });
    }

    const { error, fields } = parseQuestionPayload(payload);
    if (error) return jsonResponse(400, { error });
    const question = await createQuestion({ ...fields, createdBy: email });
    return jsonResponse(200, { question });
  }

  return jsonResponse(405, { error: "method not allowed" });
};
