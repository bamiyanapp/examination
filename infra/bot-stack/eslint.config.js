const js = require("@eslint/js");
const globals = require("globals");
const sonarjs = require("eslint-plugin-sonarjs");
const n = require("eslint-plugin-n");

module.exports = [
  {
    ignores: ["coverage/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    plugins: { sonarjs, n },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { args: "none" }],
      complexity: ["error", 15],
      ...sonarjs.configs.recommended.rules,
      ...n.configs["flat/recommended"].rules,
      // n/no-unpublished-*はnpmへpublishするパッケージ向けのルールで、Lambdaへ
      // 直接デプロイする非publishパッケージであるbot-stackには当てはまらない。
      // devDependencies（vitest・eslint関連等）をテスト・設定ファイルから
      // require/importするだけで大量に誤検知するため無効化する（karuta backend
      // eslint.config.jsと同様の方針）
      "n/no-unpublished-import": "off",
      "n/no-unpublished-require": "off",
    },
  },
  {
    // configuration.jsonはデプロイ時にscripts/generate-config.jsが生成するファイルで、
    // gitには含めない（.gitignore参照）。lint実行時（生成前）には存在しないため誤検知する
    files: ["functions/deleteFamilyData.js", "functions/geminiConversation.js", "functions/lineWebhook.js", "functions/notifyFamilyCreated.js"],
    rules: {
      "n/no-missing-require": "off",
    },
  },
  {
    // vitestのテストファイルはESM構文(import/export)で書かれている
    files: ["**/*.test.js"],
    languageOptions: {
      sourceType: "module",
    },
  },
];
