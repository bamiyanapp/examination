"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KNOWLEDGE_DIR = path.join(__dirname, "..", "..", "..", "knowledge", "education");

const SOURCES = [
  { file: "interview-yosuke.md", category: "父の保護者面接" },
  { file: "interview-tomoyo.md", category: "母の保護者面接" },
  { file: "interview-ritsu.md", category: "本人面接" },
];

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

// 共通形式（No | 質問 | 回答）のテーブルを抽出する。
// interview-yosuke.mdの詳細版テーブル（想定質問 | 回答の要点 | 盛り込む具体例 | 面接官への印象）は
// 列数が異なるため別関数で扱う
function parseSimpleQaTables(markdown) {
  const lines = markdown.split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const header = splitRow(lines[i]);
    if (header.length !== 3 || header[0] !== "No" || header[1] !== "質問" || header[2] !== "回答") continue;
    if (!lines[i + 1] || !isSeparatorRow(splitRow(lines[i + 1]))) continue;
    let j = i + 2;
    while (lines[j] && lines[j].trim().startsWith("|")) {
      const cells = splitRow(lines[j]);
      if (cells.length === 3 && cells[1] && cells[2]) {
        rows.push({ question: cells[1], answer: cells[2], example: "", impression: "" });
      }
      j++;
    }
    i = j - 1;
  }
  return rows;
}

// examination#77: 「回答の要点」「盛り込む具体例」「面接官への印象」を個別カラムとして
// 保持する（従来はanswerへ結合しており、面接官への印象が投入時に失われていた）
function parseDetailedQaTable(markdown) {
  const lines = markdown.split("\n");
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith("|")) continue;
    const header = splitRow(lines[i]);
    if (header[0] !== "想定質問" || header[1] !== "回答の要点") continue;
    if (!lines[i + 1] || !isSeparatorRow(splitRow(lines[i + 1]))) continue;
    let j = i + 2;
    while (lines[j] && lines[j].trim().startsWith("|")) {
      const cells = splitRow(lines[j]);
      if (cells.length >= 2 && cells[0] && cells[1]) {
        rows.push({
          question: cells[0],
          answer: cells[1],
          example: cells[2] || "",
          impression: cells[3] || "",
        });
      }
      j++;
    }
    i = j - 1;
  }
  return rows;
}

function collectQuestions() {
  const questions = [];
  for (const { file, category } of SOURCES) {
    const filePath = path.join(KNOWLEDGE_DIR, file);
    const markdown = fs.readFileSync(filePath, "utf-8");
    const rows = [...parseDetailedQaTable(markdown), ...parseSimpleQaTables(markdown)];
    for (const row of rows) {
      questions.push({ category, ...row });
    }
  }
  return questions;
}

// familySlug・category・questionから決定的なquestionIdを生成する（examination#77）。
// これにより本スクリプトは何度実行しても同じ行を上書きするだけになり（新規重複を
// 作らない）、Markdownを唯一の入力源とした再実行可能な移行・同期処理にできる。
// LINE botの登録モード（saveQuestion、時刻+ランダム値のID）とはID体系が異なるため衝突しない
function buildQuestionId(familySlug, category, question) {
  return crypto.createHash("sha256").update(`${familySlug}::${category}::${question}`).digest("hex").slice(0, 32);
}

// 決定的questionId（buildQuestionIdが生成する32桁の16進数文字列）の形式
const DETERMINISTIC_ID_PATTERN = /^[0-9a-f]{32}$/;

// 旧シードスクリプト（時刻+ランダム値のID、examination#77以前）が投入した行を削除する。
// createdBy="seed"かつ決定的ID形式でない行のみを対象とするため、LINE botの登録モード
// （saveQuestion、createdByは実際のLINEユーザーID）で追加された行を誤って消すことはない
async function removeLegacySeedRows(ddb, tableName, familySlug) {
  const { QueryCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
  const result = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: "familySlug = :slug",
      ExpressionAttributeValues: { ":slug": { S: familySlug } },
    })
  );
  const legacyItems = (result.Items || []).filter(
    (item) => item.createdBy?.S === "seed" && !DETERMINISTIC_ID_PATTERN.test(item.questionId?.S || "")
  );
  for (const item of legacyItems) {
    await ddb.send(
      new DeleteItemCommand({
        TableName: tableName,
        Key: { familySlug: item.familySlug, questionId: item.questionId },
      })
    );
  }
  if (legacyItems.length > 0) {
    console.log(`Removed ${legacyItems.length} legacy seed row(s) superseded by deterministic IDs`);
  }
}

async function seed() {
  const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
  const region = process.env.AWS_REGION || "ap-northeast-1";
  const tableName = process.env.INTERVIEW_QUESTIONS_TABLE || "examination-interview-questions";
  const familySlug = process.env.FAMILY_SLUG || "chofu-suzuki";
  const ddb = new DynamoDBClient({ region });

  await removeLegacySeedRows(ddb, tableName, familySlug);

  const questions = collectQuestions();
  console.log(`Seeding ${questions.length} questions into ${tableName} (familySlug=${familySlug})`);
  for (const q of questions) {
    const questionId = buildQuestionId(familySlug, q.category, q.question);
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          familySlug: { S: familySlug },
          questionId: { S: questionId },
          category: { S: q.category },
          question: { S: q.question },
          answer: { S: q.answer },
          example: { S: q.example || "" },
          impression: { S: q.impression || "" },
          // AIによる模範解答生成（examination#77、後続対応）用のプレースホルダー
          modelAnswer: { S: "" },
          createdBy: { S: "seed" },
          createdAt: { S: new Date().toISOString() },
        },
      })
    );
  }
  console.log("Done.");
}

if (require.main === module) {
  seed().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  collectQuestions,
  parseSimpleQaTables,
  parseDetailedQaTable,
  buildQuestionId,
  removeLegacySeedRows,
};
