"use strict";

const fs = require("fs");
const path = require("path");

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
        rows.push({ question: cells[1], answer: cells[2] });
      }
      j++;
    }
    i = j - 1;
  }
  return rows;
}

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
        const example = cells[2] ? `${cells[1]}（具体例: ${cells[2]}）` : cells[1];
        rows.push({ question: cells[0], answer: example });
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
      questions.push({ category, question: row.question, answer: row.answer });
    }
  }
  return questions;
}

async function seed() {
  const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
  const crypto = require("crypto");
  const region = process.env.AWS_REGION || "ap-northeast-1";
  const tableName = process.env.INTERVIEW_QUESTIONS_TABLE || "examination-interview-questions";
  const familySlug = process.env.FAMILY_SLUG || "chofu-suzuki";
  const ddb = new DynamoDBClient({ region });

  const questions = collectQuestions();
  console.log(`Seeding ${questions.length} questions into ${tableName} (familySlug=${familySlug})`);
  for (const q of questions) {
    const questionId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          familySlug: { S: familySlug },
          questionId: { S: questionId },
          category: { S: q.category },
          question: { S: q.question },
          answer: { S: q.answer },
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

module.exports = { collectQuestions, parseSimpleQaTables, parseDetailedQaTable };
