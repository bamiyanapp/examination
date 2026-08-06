// release-config.cjsはCIの実行時にdev-standardsからコピーされる
// （reusable-cd.ymlのenable_shared_release_config: true、copy-release-config
// composite action）。ローカルには存在しないため、CI以外でこのファイルを
// 直接requireすると失敗する（dev-standards自身の.releaserc.cjsと同じ構成）。
const { buildReleaseConfig } = require("./release-config.cjs");

module.exports = buildReleaseConfig({
  repositoryUrl: "https://github.com/bamiyanapp/examination.git",
  gitAssets: ["CHANGELOG.md", "package.json", "package-lock.json"],
  // 既定のCHANGELOG.md→JSON変換はfrontendディレクトリを1つ持つ参照側リポジトリ向けの
  // ステップで、examinationはapp/配下に独立ビルドのReactアプリが複数あり単一の
  // frontendディレクトリを持たないため不要（実行するとfrontend/src/changelog.jsonが
  // 誤って作成されてしまう）。no-opにする
  changelogPrepareCmd: "true",
});
