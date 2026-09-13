// infra/bot-stack・infra/site-stackが共通で使うESLint flat config基盤。
// js/globals/sonarjs/nは呼び出し元（各パッケージのeslint.config.js）自身の
// node_modulesから解決させる必要があるため、このファイル自身ではrequireせず
// 引数で受け取る（bot-stack・site-stackはそれぞれ独立したnpmパッケージで、
// npm workspaces等の依存ホイスティングを行っていないため）。生成される設定ファイル
// （configuration.json等、デプロイ時にscripts/generate-config.jsが生成しgitには
// 含めない）を参照するファイル一覧だけがパッケージごとに異なるため、これも引数で
// 受け取る。jscpdの重複検知（examination#447）を機に切り出した
function buildBaseConfig({ js, globals, sonarjs, n, generatedConfigConsumers }) {
  return [
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
        // n/no-unpublished-*はnpmへpublishするパッケージ向けのルールで、Lambda(@Edge)へ
        // 直接デプロイする非publishパッケージには当てはまらない。devDependencies
        // （vitest・eslint関連等）をテスト・設定ファイルからrequire/importするだけで
        // 大量に誤検知するため無効化する（karuta backend eslint.config.jsと同様の方針）
        "n/no-unpublished-import": "off",
        "n/no-unpublished-require": "off",
      },
    },
    {
      // configuration.jsonはデプロイ時にscripts/generate-config.jsが生成するファイルで、
      // gitには含めない（.gitignore参照）。lint実行時（生成前）には存在しないため誤検知する
      files: generatedConfigConsumers,
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
}

module.exports = { buildBaseConfig };
