"use strict";

// dev-standards共有のtextlint.config.cjs（textlint-rule-preset-ja-technical-writing
// ベース）をそのまま継承し、examination固有の例外のみを上書きする
// （examination#477・#615）。全ての判断材料（文体がdev-standards標準どおり常体
// 統一であること等）はexamination#477で確認済みで、examination独自のカスタマイズは
// この1点のみ。dev-standards/textlint.config.cjs自体はsymlinkのまま他リポジトリへ
// 配布される前提のため、ここではrequireで取り込み、ルール設定をマージする
const base = require("./dev-standards/textlint.config.cjs");

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    "preset-ja-technical-writing": {
      ...base.rules["preset-ja-technical-writing"],
      // 「小学校受験対策」（examinationのプロダクト名そのもの、README.md・CLAUDE.md
      // 冒頭で頻出する）が漢字7文字連続として誤検知される。固有名詞のため分割できず、
      // 個別に許容する。maxはpreset既定値（6）を明示的に維持する（allowのみ上書きすると
      // ルール本体の既定値5に戻ってしまうため）
      "max-kanji-continuous-len": { max: 6, allow: ["小学校受験対策"] },
    },
  },
};
