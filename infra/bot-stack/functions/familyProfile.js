"use strict";

const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { DEFAULT_SITUATION } = require("./geminiConversation");

const FAMILY_PROFILE_TABLE = "examination-family-profile";
const MAX_FIELD_LENGTH = 500;

const ddb = new DynamoDBClient({ region: "us-east-1" });

// シチュエーション・志望先の特色・その他前提情報を家族単位で1件だけ保持する
// プロフィール（examination#125、シチュエーションはexamination#135で追加）。
// 以前は面接練習（音声対話ページ・LINE bot）のたびに毎回自由入力していたが、
// 練習の度に入力し直すものではないため、プロフィール編集画面（app/profile-edit/）
// で編集・保存し、面接練習側は参照するのみにする。familySlugは呼び出し元が
// 認証情報から解決した値を渡す（複数家族対応、examination#44・#239）
async function getFamilyProfile(familySlug) {
  const result = await ddb.send(
    new GetItemCommand({ TableName: FAMILY_PROFILE_TABLE, Key: { familySlug: { S: familySlug } } })
  );
  if (!result.Item) {
    return { situation: DEFAULT_SITUATION, schoolCharacteristics: "", otherContext: "", childName: "", fatherName: "", motherName: "" };
  }
  return {
    situation: result.Item.situation?.S || DEFAULT_SITUATION,
    schoolCharacteristics: result.Item.schoolCharacteristics?.S || "",
    otherContext: result.Item.otherContext?.S || "",
    // 想定問答（examination-interview-questions）で「本人」「父」「母」と一般化して
    // 保存している箇所を、閲覧画面側で実際の氏名に差し替えて表示するために使う
    // （examination#431）。氏名自体はここにのみ保存し、想定問答データ本体には含めない
    childName: result.Item.childName?.S || "",
    fatherName: result.Item.fatherName?.S || "",
    motherName: result.Item.motherName?.S || "",
  };
}

async function saveFamilyProfile({
  familySlug,
  situation,
  schoolCharacteristics,
  otherContext,
  childName,
  fatherName,
  motherName,
  updatedBy,
}) {
  await ddb.send(
    new PutItemCommand({
      TableName: FAMILY_PROFILE_TABLE,
      Item: {
        familySlug: { S: familySlug },
        situation: { S: situation || DEFAULT_SITUATION },
        schoolCharacteristics: { S: schoolCharacteristics || "" },
        otherContext: { S: otherContext || "" },
        childName: { S: childName || "" },
        fatherName: { S: fatherName || "" },
        motherName: { S: motherName || "" },
        updatedBy: { S: updatedBy || "" },
        updatedAt: { S: new Date().toISOString() },
      },
    })
  );
}

module.exports = { MAX_FIELD_LENGTH, getFamilyProfile, saveFamilyProfile };
