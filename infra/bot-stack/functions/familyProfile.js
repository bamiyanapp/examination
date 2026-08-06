"use strict";

const { DynamoDBClient, GetItemCommand, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { FAMILY_SLUG } = require("./familyConfig");

const FAMILY_PROFILE_TABLE = "examination-family-profile";
const MAX_FIELD_LENGTH = 500;

const ddb = new DynamoDBClient({ region: "us-east-1" });

// 志望先の特色・その他前提情報を家族単位で1件だけ保持するプロフィール
// （examination#125）。以前は面接練習（音声対話ページ・LINE bot）のたびに毎回
// 自由入力していたが、練習の度に入力し直すものではないため、プロフィール編集画面
// （app/profile-edit/）で編集・保存し、面接練習側は参照するのみにする
async function getFamilyProfile() {
  const result = await ddb.send(
    new GetItemCommand({ TableName: FAMILY_PROFILE_TABLE, Key: { familySlug: { S: FAMILY_SLUG } } })
  );
  if (!result.Item) {
    return { schoolCharacteristics: "", otherContext: "" };
  }
  return {
    schoolCharacteristics: result.Item.schoolCharacteristics?.S || "",
    otherContext: result.Item.otherContext?.S || "",
  };
}

async function saveFamilyProfile({ schoolCharacteristics, otherContext, updatedBy }) {
  await ddb.send(
    new PutItemCommand({
      TableName: FAMILY_PROFILE_TABLE,
      Item: {
        familySlug: { S: FAMILY_SLUG },
        schoolCharacteristics: { S: schoolCharacteristics || "" },
        otherContext: { S: otherContext || "" },
        updatedBy: { S: updatedBy || "" },
        updatedAt: { S: new Date().toISOString() },
      },
    })
  );
}

module.exports = { MAX_FIELD_LENGTH, getFamilyProfile, saveFamilyProfile };
