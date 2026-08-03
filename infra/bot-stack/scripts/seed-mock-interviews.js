"use strict";

const crypto = require("crypto");

// knowledge/education/mock-interviews.mdの既存2件を一度きり移行するためのデータ
// （examination#93）。ソースが自由記述のプローズ（表形式ではない）で、今後この
// ファイルに新規追記される想定も無い（今後はアプリが会話終了時にサマリーを生成し
// 直接DynamoDBへ保存する）ため、汎用パーサーは作らずそのまま書き起こす
const RECORDS = [
  {
    role: "父",
    situation: "小学校受験の保護者面接（よーすけ役の想定問答練習）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-01T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・「本人の興味・主体性を尊重し、押し付けずに気づかせる」という教育観が、教育方針・間違いへの対応・善悪の教え方まで一貫していた\n" +
      "・図工の授業内容（庭の草から色を取る等）など学校研究に基づく具体例を志望理由に盛り込めていた\n" +
      "・エピソードが具体的（図鑑や動画で興味を広げる、妹とのやり取り、車中での対話、釣り・キャンプ）で、抽象論で終わっていなかった\n\n" +
      "改善が必要な点:\n" +
      "・回答がやや説明口調・箇条書き的になりがちなので、本番は「〜と思います」「〜しております」といった丁寧な話し言葉に整えるとより伝わりやすい\n" +
      "・「善悪の教え方」の回答で「基本的には本人に悪意があるということはない」という前置きから入ると、面接官には少し唐突に聞こえる可能性がある。先に結論（相手の気持ちを想像させて教えている）を述べてから補足する構成の方が聞き取りやすい\n" +
      "・緊張すると早口になりやすい場合、一呼吸置いてから話し始める練習もおすすめ\n\n" +
      "次回までのアクション:\n" +
      "・各回答を「結論→具体例→まとめ」の順で30秒程度に収める練習をする\n" +
      "・まだ準備できていない質問（「その他の想定問答」、通学方法など）にも目を通しておく\n" +
      "・ともよさんにも同じ質問（特に教育方針まわり）に答えてもらい、夫婦で内容の食い違いがないか確認する",
  },
  {
    role: "家族",
    situation: "小学校受験の面接（塾でのコーチ付き模擬面接、りつ・父・母 同席の家族面接形式）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-01T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・りつ: 最初は緊張していたが、名前を聞かれたあたりから受け答えが安定してきた\n" +
      "・父: 志望理由で、学校見学（体験パーク）で実際に感じた具体的なエピソード（先生が一人ひとりの名前を呼ぶ、手を挙げても指されなかった子へのフォロー）を交えて話せていた。学校の教育理念を勉強した上で、家庭の教育方針もきちんとまとめられていた\n" +
      "・家族3人: 名前の由来を子に語りかける場面で、家族としてのまとまりが感じられた\n\n" +
      "改善が必要な点:\n" +
      "・志望理由は面接の最大のメインイベントであり、最も時間をかけて聞かれる質問。実際に見学して感じた「その人にしか感じない具体例」を、他の質問を待たずに自分から最初に話してしまうくらいの意識で構成すると良い（短い面接時間では、用意していた内容を聞かれないまま終わることも多いため）\n" +
      "・名前の由来を子に語りかける場面で、父ももっと踏み込んで子どもに触れる・母と一緒に子を見つめる・母の言葉に頷く等、大げさなくらいのスキンシップ・相槌を意識すると、家族としての一体感がさらに伝わる（りつは照れ屋なので特に）\n" +
      "・りつの回答は、語尾に「です」をつけるとより丁寧で完成度の高い印象になる\n" +
      "・りつ本人が、自宅の住所・電話番号（家族の携帯番号）を答えられるようにしておく（今回は答えられなかった）\n" +
      "・入室・退室の挨拶の型（受験番号→氏名→「本日はよろしくお願いします」→3人揃ってお辞儀→着席）を練習しておくと、より流れがスムーズになる\n\n" +
      "次回までのアクション:\n" +
      "・父: 志望理由の冒頭に、学校見学時の具体的なエピソードを最初に持ってくる構成に組み替える\n" +
      "・父: 学校とのトラブル対応について、コーチから示された模範回答（①まず子の気持ちに寄り添って話を聞く→②学校へ事実確認の連絡をする→③学校の指示に従うことを明言する）を練習しておく\n" +
      "・家族: 入室・退室の型（受験番号・氏名・挨拶・3人でのお辞儀）を練習する\n" +
      "・りつ: 自宅の住所・電話番号（家族の携帯番号）を覚える\n" +
      "・りつ: 回答の語尾に「です」をつける練習をする\n\n" +
      "補足（一般的な面接評価について）:\n" +
      "・面接評価はC/B/Aの3段階で、Aが合格ライン相当とのこと。回答の型（志望理由の構成、入退室の挨拶等）を練習で固めることで、より安定した評価につながるとのアドバイスがあった",
  },
];

// familySlug・createdAt・roleから決定的なsessionIdを生成する（examination#93、
// examination#77のbuildQuestionIdと同じ考え方）。これにより本スクリプトは
// 何度実行しても同じ行を上書きするだけになり、新規重複を作らない
function buildSessionId(familySlug, createdAt, role) {
  return crypto.createHash("sha256").update(`${familySlug}::${createdAt}::${role}`).digest("hex").slice(0, 32);
}

async function seed() {
  const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
  const region = process.env.AWS_REGION || "ap-northeast-1";
  const tableName = process.env.MOCK_INTERVIEWS_TABLE || "examination-mock-interviews";
  const familySlug = process.env.FAMILY_SLUG || "chofu-suzuki";
  const ddb = new DynamoDBClient({ region });

  console.log(`Seeding ${RECORDS.length} mock interview record(s) into ${tableName} (familySlug=${familySlug})`);
  for (const record of RECORDS) {
    const sessionId = buildSessionId(familySlug, record.createdAt, record.role);
    await ddb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          familySlug: { S: familySlug },
          sessionId: { S: sessionId },
          role: { S: record.role },
          situation: { S: record.situation },
          schoolCharacteristics: { S: record.schoolCharacteristics || "" },
          channel: { S: record.channel },
          summary: { S: record.summary },
          createdBy: { S: "seed" },
          createdAt: { S: record.createdAt },
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

module.exports = { RECORDS, buildSessionId };
