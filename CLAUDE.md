@dev-standards/CLAUDE.md

# examination固有ルール

家族向けナレッジベース（[Issue #4](https://github.com/bamiyanapp/examination/issues/4)）。小学校受験対策（想定問題・模擬面接記録）のほか、家族マニュアル・保育園・旅行・住まい・車等の情報をMkDocs Materialで静的サイト化して管理する。

- コンテンツ本体: `knowledge/`配下のMarkdown（`docs/`はdev-standards共通規約のCI/CD仕様ドキュメント専用で、サイトコンテンツとは別）。`mkdocs.yml`（`nav`）にページを追加する場合は必ずセットで更新する
- **Reactアプリへの段階移行中**（[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）: 音声対話・管理画面等のインタラクティブなページは`app/`配下のReact（Vite）アプリとして実装し、ビルド成果物を`deploy.yml`でMkDocs静的サイトの同一URLパスへ上書き配置する。家族情報・旅行・車等の静的コンテンツページは当面Markdownのまま（`knowledge/`配下）とし、react-markdown等での表示に段階的に移行する
- パッケージ構成: `app/`配下、ページごとに独立したReact（Vite）アプリ（例: `app/line-link/`、`app/allowed-emails/`、`app/voice-practice/`、`app/top/`）のみ。`ci.yml`の`packages`にそれぞれlint/test/build対象として登録する。それ以外のリポジトリ全体としてはfrontend/backend固定ディレクトリ構成を持たないため、`reusable-ci.yml`のfrontend-test/backend-testジョブは使わない。MkDocsのビルド検証は別ワークフロー（`.github/workflows/mkdocs.yml`）で行う
- リリース運用: 行わない（配布・デプロイ対象の成果物が無いため、`.github/workflows/cd.yml`・semantic-releaseは導入しない）。詳細は`docs/cicd-pipeline-specification.md`を参照
- サイトの公開先（AWS S3 + CloudFront + Cognito Google認証）は`infra/`（Serverless Framework v3系・OSS版）で定義し、`main`へのpushで`.github/workflows/deploy.yml`が自動デプロイする（Issue #6）。AWSリソースの詳細・デプロイ順序は`infra/README.md`を参照
- コンテンツ（想定問題・模擬面接記録・家族情報等）の追加・更新もIssue駆動の原則の対象とする
