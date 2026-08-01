# CI/CD Pipeline Specification（examination固有）

共通仕様（`reusable-ci.yml` / `reusable-cd.yml` 自体の挙動）は [dev-standards/docs/cicd-pipeline-specification.md](../dev-standards/docs/cicd-pipeline-specification.md) を参照する。本ドキュメントにはexamination固有の構成のみを記載する。

## CIワークフロー（`.github/workflows/ci.yml`）

本リポジトリはfrontend/backendのアプリケーションコードを持たない、家族向けナレッジベース（MkDocs Material、[Issue #4](https://github.com/bamiyanapp/examination/issues/4)）のため、`reusable-ci.yml` を以下の構成で呼び出す。

- `packages: "[]"`: lint/test/buildを行うnpmパッケージが無いため、`frontend-test`/`backend-test`/`package-test`のいずれも実行しない
- `enable_standards_check: true`: `dev-standards` submoduleのsymlink欠落・`.gitignore`の内容乖離を検知する
- 実質的に実行されるジョブは `commitlint`（コミットメッセージ・PRタイトルのConventional Commits検証）と `standards-check` のみ

コミットメッセージ検証（`npm ci` → `commitlint`）のため、リポジトリルートに `package.json`（`@commitlint/cli` / `@commitlint/config-conventional` のみを依存に持つ）を配置している。

## MkDocsビルド検証ワークフロー（`.github/workflows/mkdocs.yml`）

`reusable-ci.yml`はNode.js（npm）エコシステム前提のワークフローであり、Python製の静的サイトジェネレータであるMkDocsのビルドをそのまま組み込む口が無いため、専用のワークフローを別途用意している。

- `push`（`main`）・`pull_request`の両方で実行
- Python環境をセットアップし、`requirements.txt`（`mkdocs-material`）をインストールした上で`mkdocs build --strict`を実行する
- `--strict`により、壊れた内部リンクや`nav`に存在しないページ等があればビルド自体を失敗させる
- 実際のS3/CloudFrontへのデプロイは含まない（下記「デプロイワークフロー」参照）

## デプロイワークフロー（`.github/workflows/deploy.yml`）

`main`へのpush時に、MkDocsビルド成果物をAWS（S3 + CloudFront + Cognito Google認証）へ自動デプロイする（Issue #6）。AWSリソース自体はTerraformではなくServerless Framework v3系（OSS版）で定義しており、詳細は[infra/README.md](../infra/README.md)を参照する。

- AWSへの認証はIAMユーザーの長期アクセスキー（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`）を使用する（OIDCロールではない）
- `infra/auth-stack`（Cognito）→ `infra/site-stack`（S3・CloudFront・Lambda@Edge）の順にデプロイし、CloudFrontドメイン確定後に`auth-stack`を再デプロイしてCallback URLを確定させる（`infra/README.md`「なぜ2つのスタックに分けているか」参照）
- サイト本体は`mkdocs build`の成果物を`aws s3 sync`でS3へ同期し、CloudFrontのキャッシュを無効化して反映する

## CDワークフロー（semantic-release）

導入していない。本リポジトリはnpmパッケージとしてのバージョン管理・GitHub Release作成の対象となる配布物を持たないため、`reusable-cd.yml`（semantic-releaseによるバージョン自動採番）を適用する意味が無い。AWSへのデプロイは上記の専用`deploy.yml`で行う（`reusable-cd.yml`とは無関係）。
