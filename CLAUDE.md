@dev-standards/CLAUDE.md

# examination固有ルール

家族向けナレッジベース（[Issue #4](https://github.com/bamiyanapp/examination/issues/4)）。小学校受験対策（想定問題・模擬面接記録）のほか、家族マニュアル等の情報を管理する。全ページ`app/`配下のReact（Vite）アプリで実装済み（[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。旧MkDocs Material静的サイト層は廃止作業中（[Issue #585](https://github.com/bamiyanapp/examination/issues/585)、段階的移行）。`knowledge/`配下のプレースホルダーファイル・`mkdocs.yml`は移行完了後に削除する（[Issue #637](https://github.com/bamiyanapp/examination/issues/637)）

- コンテンツ本体: `app/`配下の各Reactアプリ（`docs/`はdev-standards共通規約のCI/CD仕様ドキュメント専用で、サイトコンテンツとは別）
- パッケージ構成: `app/`配下、ページごとに独立したReact（Vite）アプリのみ（例: `app/line-link/`・`app/allowed-emails/`等）。`ci.yml`の`packages`にそれぞれlint/test/build対象として登録する。本リポジトリはfrontend/backend固定ディレクトリ構成を持たないため、`reusable-ci.yml`のfrontend-test/backend-testジョブは使わない
- リリース運用: `.github/workflows/cd.yml`が`dev-standards`の`reusable-cd.yml`（semantic-release）を使う。Conventional Commitsからセマンティックバージョンを自動算出し、GitHub Release・[`CHANGELOG.md`](CHANGELOG.md)を作成する（[Issue #137](https://github.com/bamiyanapp/examination/issues/137)）。npm公開は行わない（`npmPublish: false`）。配布・デプロイ対象の成果物としてnpmパッケージを公開する意味は無いが、算出したバージョン番号自体はトップページのバージョン表示（下記）に利用する。詳細は[`docs/cicd-pipeline-specification.md`](docs/cicd-pipeline-specification.md)を参照
- サイトの公開先（AWS S3 + CloudFront + Cognito Google認証）は`infra/`（OSLS、`osls`パッケージ）で定義する。OSLSはServerless Framework v3系のままオープンソースで開発が継続されているフォークである。`main`へのpushで`.github/workflows/cd.yml`の`deploy`ジョブ（`release`ジョブに続けて実行）が自動デプロイする（Issue #6）。AWSリソースの詳細・デプロイ順序は`infra/README.md`を参照
- コンテンツ（想定問題・模擬面接記録・家族情報等）の追加・更新もIssue駆動の原則の対象とする
