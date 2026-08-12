"use strict";

// examination-interview-questions・examination-mock-interviewsの全文字列フィールドを
// スキャンし、U+FFFD（Unicodeの置換文字）を含むレコードを検出する。
//
// 背景（examination#182）: geminiConversation.js postJson・checkAuth.js postForm
// が、HTTPSレスポンスをチャンクごとにtoString()していたため、マルチバイト文字が
// チャンク境界で分割された場合に文字化け（U+FFFD）が発生していた（修正済み）。
// このスクリプトは、修正前に生成・保存されてしまった既存データの文字化け箇所を
// 洗い出すための一回限りの調査用スクリプト。実際の修正は、検出結果をもとに
// 想定問答画面の編集機能（examination-interview-questions側）等で手動で行う。
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");

const ddb = new DynamoDBClient({ region: "us-east-1" });

const MOJIBAKE_CHAR = "�";

const TARGETS = [
  {
    tableName: "examination-interview-questions",
    keyFields: ["familySlug", "questionId"],
  },
  {
    tableName: "examination-mock-interviews",
    keyFields: ["familySlug", "sessionId"],
  },
];

function snippet(text, index, radius = 20) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

async function scanTable({ tableName, keyFields }) {
  const findings = [];
  let ExclusiveStartKey;
  do {
    const result = await ddb.send(new ScanCommand({ TableName: tableName, ExclusiveStartKey }));
    for (const item of result.Items || []) {
      const key = keyFields.map((field) => item[field]?.S || "").join(" / ");
      for (const [field, attr] of Object.entries(item)) {
        if (typeof attr.S !== "string") continue;
        const index = attr.S.indexOf(MOJIBAKE_CHAR);
        if (index === -1) continue;
        findings.push({ tableName, key, field, snippet: snippet(attr.S, index) });
      }
    }
    ExclusiveStartKey = result.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return findings;
}

async function main() {
  const allFindings = [];
  for (const target of TARGETS) {
    const findings = await scanTable(target);
    allFindings.push(...findings);
  }

  if (allFindings.length === 0) {
    console.log("文字化け（U+FFFD）を含むレコードは見つかりませんでした。");
    return;
  }

  console.log(`文字化け（U+FFFD）を含むレコードが${allFindings.length}件見つかりました。\n`);
  for (const finding of allFindings) {
    console.log(`- テーブル: ${finding.tableName}`);
    console.log(`  キー: ${finding.key}`);
    console.log(`  フィールド: ${finding.field}`);
    console.log(`  該当箇所: ${finding.snippet}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
