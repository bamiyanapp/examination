"use strict";

// examination#182で見つかった、examination-mock-interviewsの特定1レコード（要約）に
// 混入した文字化け（U+FFFD置換文字の連続）を修正する一回限りのスクリプト。
// find-mojibake.jsの検出結果（テーブル: examination-mock-interviews、
// キー: chofu-suzuki / 1785937183105-347d6b25、フィールド: summary）に対応する。
//
// U+FFFDの連続は、元のマルチバイト文字（この文脈では質問の区切りを表す開き括弧
// 「」がチャンク境界で分割されて生じたものと判断した（前後の文脈「...好きか」」
// ↔「なぜ...」から、本来「」（U+300C）が入るべき箇所と判断）。
//
// 既定はドライラン（実際の書き込みを行わず、現在の値と修正後の値を表示するのみ）。
// 実際に書き込むには環境変数 APPLY=true を指定する。
const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const ddb = new DynamoDBClient({ region: "us-east-1" });

const TABLE_NAME = "examination-mock-interviews";
const FAMILY_SLUG = "chofu-suzuki";
const SESSION_ID = "1785937183105-347d6b25";
const FIELD = "summary";

function fixMojibake(text) {
  // 置換文字（U+FFFD）が1文字以上連続する箇所を、開き括弧「に置き換える
  return text.replace(/�+/gu, "「");
}

async function main() {
  const result = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { familySlug: { S: FAMILY_SLUG }, sessionId: { S: SESSION_ID } },
    })
  );
  if (!result.Item) {
    throw new Error(`レコードが見つかりません: ${FAMILY_SLUG} / ${SESSION_ID}`);
  }

  const before = result.Item[FIELD]?.S || "";
  const after = fixMojibake(before);

  console.log("=== 修正前 ===");
  console.log(before);
  console.log("\n=== 修正後 ===");
  console.log(after);

  if (before === after) {
    console.log("\n差分がありません（既に修正済み、または対象箇所が見つかりませんでした）。");
    return;
  }

  if (process.env.APPLY !== "true") {
    console.log("\nドライランのため書き込みは行っていません。内容を確認の上、APPLY=trueで再実行してください。");
    return;
  }

  await ddb.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: { ...result.Item, [FIELD]: { S: after } },
    })
  );
  console.log("\n書き込みました。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
