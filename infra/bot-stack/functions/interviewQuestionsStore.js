"use strict";

const crypto = require("crypto");
const { DynamoDBClient, PutItemCommand, QueryCommand } = require("@aws-sdk/client-dynamodb");
const { FAMILY_SLUG } = require("./familyConfig");

const INTERVIEW_QUESTIONS_TABLE = "examination-interview-questions";

const ddb = new DynamoDBClient({ region: "us-east-1" });

// categoryは「本人面接」「父の保護者面接」「母の保護者面接」のいずれかとして
// LINE botの登録モード（lineWebhook.js）がGeminiに抽出させている。対象者
// （examination#77）はこのcategoryから機械的に導出し、AIに別途出力させて
// 食い違うリスクを避ける
const CATEGORY_TARGET_PERSON = {
  本人面接: "本人",
  父の保護者面接: "父",
  母の保護者面接: "母",
};

// 上記の逆引き。練習セッションの照合（examination#147）で新規の質問を追加する際、
// roleは既にtargetPersonと同じ語彙（本人/父/母）で分かっているため、AIには
// categoryを出力させず決定的に導出する
const TARGET_PERSON_CATEGORY = Object.fromEntries(
  Object.entries(CATEGORY_TARGET_PERSON).map(([category, targetPerson]) => [targetPerson, category])
);

function deriveTargetPerson(category) {
  return CATEGORY_TARGET_PERSON[category] || "";
}

function toQuestionItem(item) {
  return {
    questionId: item.questionId?.S || "",
    category: item.category?.S || "",
    targetPerson: item.targetPerson?.S || "",
    question: item.question?.S || "",
    answer: item.answer?.S || "",
    example: item.example?.S || "",
    impression: item.impression?.S || "",
    modelAnswer: item.modelAnswer?.S || "",
    createdBy: item.createdBy?.S || "",
    createdAt: item.createdAt?.S || "",
  };
}

async function saveQuestion({ category, question, answer, createdBy }) {
  const questionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  await ddb.send(
    new PutItemCommand({
      TableName: INTERVIEW_QUESTIONS_TABLE,
      Item: {
        familySlug: { S: FAMILY_SLUG },
        questionId: { S: questionId },
        category: { S: category },
        targetPerson: { S: deriveTargetPerson(category) },
        question: { S: question },
        answer: { S: answer },
        createdBy: { S: createdBy },
        createdAt: { S: new Date().toISOString() },
      },
    })
  );
  return questionId;
}

// 練習セッションの照合（examination#147）で、対象者（本人/父/母）に紐づく既存の
// 想定問答をGeminiへの候補リストとして渡すために取得する。familySlugのみが
// キーのためQuery＋FilterExpressionで絞り込む（GSIを追加するほどの規模ではない）
async function queryQuestionsByTargetPerson(targetPerson) {
  const result = await ddb.send(
    new QueryCommand({
      TableName: INTERVIEW_QUESTIONS_TABLE,
      KeyConditionExpression: "familySlug = :slug",
      FilterExpression: "targetPerson = :targetPerson",
      ExpressionAttributeValues: {
        ":slug": { S: FAMILY_SLUG },
        ":targetPerson": { S: targetPerson },
      },
    })
  );
  return (result.Items || []).map(toQuestionItem);
}

// summarizeMockInterview（geminiConversation.js）が生成したquestions配列を
// examination-interview-questionsへ反映する（examination#77要望3、#147）。
// UpdateItem権限を新たに付与せずに済むよう、matchedQuestionIdがある場合は
// 事前に取得済みの既存アイテム全体を使ってPutItemで該当フィールドのみ差し替えて
// 書き戻す（他のフィールドは維持される）
async function applyReconciliationResults(items, targetPerson, existingQuestions) {
  const existingById = new Map((existingQuestions || []).map((q) => [q.questionId, q]));

  for (const item of items || []) {
    if (!item.shouldPersist) continue;

    if (item.matchedQuestionId) {
      if (!item.shouldUpdateModelAnswer) continue;
      const existing = existingById.get(item.matchedQuestionId);
      // AIが存在しないIDを幻覚で返した場合は更新のしようが無いためスキップする
      if (!existing) continue;
      await ddb.send(
        new PutItemCommand({
          TableName: INTERVIEW_QUESTIONS_TABLE,
          Item: {
            familySlug: { S: FAMILY_SLUG },
            questionId: { S: existing.questionId },
            category: { S: existing.category },
            targetPerson: { S: existing.targetPerson },
            question: { S: existing.question },
            answer: { S: existing.answer },
            example: { S: existing.example },
            createdBy: { S: existing.createdBy },
            createdAt: { S: existing.createdAt },
            modelAnswer: { S: item.modelAnswer },
            impression: { S: item.impression },
          },
        })
      );
      continue;
    }

    if (!item.question) continue;
    const questionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    await ddb.send(
      new PutItemCommand({
        TableName: INTERVIEW_QUESTIONS_TABLE,
        Item: {
          familySlug: { S: FAMILY_SLUG },
          questionId: { S: questionId },
          category: { S: TARGET_PERSON_CATEGORY[targetPerson] || "" },
          targetPerson: { S: targetPerson },
          question: { S: item.question },
          answer: { S: item.answer || "" },
          modelAnswer: { S: item.modelAnswer },
          impression: { S: item.impression },
          createdBy: { S: "practice" },
          createdAt: { S: new Date().toISOString() },
        },
      })
    );
  }
}

module.exports = {
  deriveTargetPerson,
  saveQuestion,
  queryQuestionsByTargetPerson,
  applyReconciliationResults,
};
