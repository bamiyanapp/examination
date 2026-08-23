"use strict";

const crypto = require("crypto");

// 2026-08-23に実施した面接特訓講座（塾でのコーチ付き模擬面接、議事録＋フィードバック
// 議事録）の内容を一度きり移行するためのデータ（examination#274と同時に依頼された
// 追加対応）。LINE bot・音声対話の練習セッションを経由しない、外部で実施された
// 実際の面接特訓の記録であるため、seed-mock-interviews.js（examination#93、旧
// mock-interviews.mdの移行）と同じ「一度きりのseedスクリプト」パターンを踏襲し、
// 新規ファイルとして追加した（examination#93移行後の既存2件を扱うseed-mock-interviews.js
// 自体は変更しない）
const RECORDS = [
  {
    role: "父",
    situation: "小学校受験の面接特訓講座（父親役の保護者面接練習）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-23T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・志望動機の冒頭は印象が良く、「学校も自立性を重視している点に共感」「図工の授業で草木を採取して絵を描くなど、五感を使って創造性・自主性を伸ばす教育に魅力を感じた」と具体的に語れていた\n" +
      "・友達に怪我をさせた場合の対応で「まず律を信じ、寄り添って理由を聞く」「学校の判断を尊重して対応する」と、私立受験で重視される学校中心の対応方針を明確に答えられていた\n" +
      "・家庭での工夫（「なぜ欲しいのか」「本当に必要か」と一度立ち止まって考えさせる、お金で解決せず自分で解決する習慣を育てる）や将来像（「自分で価値を発揮し、手応えと誇りを持って働く大人になってほしい」）を具体的に語れていた\n\n" +
      "改善が必要な点:\n" +
      "・全体的に声がやや小さく滑舌が弱く、聞き取りづらい部分があった。緊張も見られたが、自然体で話せれば問題ない\n" +
      "・「えー」「そうですね」等のフィラーが多く、考えながら話している印象になっていた\n" +
      "・「自宅から遠いので私立は抵抗があった」という表現は、通学距離へのネガティブな言及に聞こえるため避けたほうがよい\n\n" +
      "次回までのアクション:\n" +
      "・志望動機など主要な質問は、丸暗記ではなく事前に回答の要点だけを準備し、結論から自然に短時間で話す練習をする\n" +
      "・志望理由から「遠い」という表現を外し、学校の教育方針への魅力をポジティブに前面に出す言い方に変える\n" +
      "・「自分の価値を持って働く」に加えて「周囲との協調性」にも触れられるようにする\n" +
      "・もう少し滑舌よく、前に出る声で話す練習をする",
  },
  {
    role: "母",
    situation: "小学校受験の面接特訓講座（母親役の保護者面接練習）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-23T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・「大切にしている自転車を友達に貸し、乗り方も教えた」「友達にも自転車が楽しいって知ってほしかった」という嬉しかったエピソードは具体的で非常に良かった\n" +
      "・虫などに集中して取り組む探求心・集中力という長所を具体的に話せていた\n" +
      "・慎重で新しいことへの挑戦に時間がかかるという短所についても、環境に慣れると自分から積極的に行動できるようになってきたという変化まで話せていた\n\n" +
      "改善が必要な点:\n" +
      "・最初は緊張していたが、徐々に自然に話せるようになった。ただし声がやや小さく滑舌が弱く聞き取りづらい部分があった\n" +
      "・思いが先行して慌てている印象があった\n" +
      "・「活発な男の子なので親がついていくのが大変」という説明は、ややネガティブに聞こえる可能性がある\n\n" +
      "次回までのアクション:\n" +
      "・落ち着いてゆったり話すことを意識し、声量・滑舌にも気をつける\n" +
      "・子育てで大変だったことは「日々楽しく子育てしています」など肯定的な表現でまとめる\n" +
      "・短所は「短所→家庭での対応（色々な場所へ連れて行く、挨拶を一緒にする、挑戦を後押しする声かけ）→現在の変化」までセットで話せるようにする",
  },
  {
    role: "本人",
    situation: "小学校受験の面接特訓講座（本人面接の練習）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-23T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・絵カードで女の子が「びっくりしてる」など、人物の行動・感情を読み取れていた\n" +
      "・保育園・担任の先生の名前、好きな遊び（レゴ、「好きなものを作ってみたいから」という理由も含めて）、将来の夢（パイロット）などを自分の言葉で答えられていた\n" +
      "・父親と遊ぶ内容について「保育園前の公園で自転車に乗る」など、具体的な回答ができていた\n\n" +
      "改善が必要な点:\n" +
      "・声が小さく、聞き取れない回答があった。滑舌が原因で「飛行機の眺めがいい」などの回答が聞き取りづらい場面もあった\n" +
      "・絵カードで、感情の読み取りはできているが「なぜそう思ったのか」という理由の説明はまだ練習が必要\n" +
      "・好き嫌い（かぼちゃが嫌い等）や将来の夢の理由まで説明する練習がまだ不足している\n\n" +
      "次回までのアクション:\n" +
      "・「先生に聞こえるように話そう」と家庭で声掛けし、最後まで明瞭な発音で、大きめの声で話す練習をする\n" +
      "・「どうして？」と必ず聞かれる前提で、好き嫌いや将来の夢について理由まで（例: かぼちゃが嫌い→食感がザラザラしているから、パイロットが好き→飛行機のどこが好きか）言えるようにする\n" +
      "・道徳カードでは、感情だけでなく「順番に並んでいるところに割り込んだから怒っている」など行動＋理由も説明できるよう、家庭で「何が良くないか」「なぜそう思うか」を会話する",
  },
  {
    role: "家族",
    situation: "小学校受験の面接特訓講座（全体評価・家庭の教育方針の一貫性）",
    schoolCharacteristics: "",
    channel: "seed",
    createdAt: "2026-08-23T00:00:00.000Z",
    summary:
      "よかった点:\n" +
      "・全体として自然体で面接できていた。母は最初は緊張していたが徐々に自然に話せるようになり、父も緊張は見られたが自然体で話せていた\n" +
      "・家庭の教育軸（「自立」「自分で考える」「自分で解決する」）と、律くんの人物像（「慎重に考えてから行動」「思慮深い」「友達に優しい」「探求心・集中力」）について、父母の回答に一貫性があった\n\n" +
      "改善が必要な点:\n" +
      "・父母ともに声がやや小さく、滑舌が弱く聞き取りづらい部分があった。面接では限られた時間で家族全体を見られるため、「先生に聞こえる声」を意識する必要がある\n\n" +
      "次回までのアクション:\n" +
      "① 父母の声量・滑舌を鍛える\n" +
      "② フィラーを減らす\n" +
      "③ 志望動機を即答できるようにする\n" +
      "④ 志望理由から「遠い」という表現を外す\n" +
      "⑤ 母の「辛かったこと」はポジティブに整理する\n" +
      "⑥ 短所＋家庭での改善策までセットで回答する\n" +
      "⑦ 「どうして？」への回答練習をする\n" +
      "⑧ 道徳カードで行動＋理由＋感情を説明できるようにする\n" +
      "⑨ 律の声を大きく最後まで明瞭に話す練習をする\n" +
      "⑩ できなかったことを責めず、改善していく姿勢で練習する\n" +
      "（家庭でも「先生に聞こえるように話そう」と声掛けし、できなかったことを責めず「次は改善しよう」という伝え方を意識する）",
  },
];

// familySlug・createdAt・roleから決定的なsessionIdを生成する（seed-mock-interviews.js・
// examination#93と同じ考え方）。これにより本スクリプトは何度実行しても同じ行を
// 上書きするだけになり、新規重複を作らない
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
