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
- 実際のS3/CloudFrontへのデプロイは含まない（[Issue #6](https://github.com/bamiyanapp/examination/issues/6)で追加予定）

## CDワークフロー

導入していない。本リポジトリはバージョン管理・デプロイの対象となる配布物（npmパッケージ、デプロイ可能なビルド成果物等）を持たないため、`reusable-cd.yml`（semantic-releaseによるバージョン自動採番・GitHub Release作成）を適用する意味が無い。将来アプリケーションコード（frontend/backend）を追加し、リリース運用が必要になった時点で `.github/workflows/cd.yml` を追加し、`packages` 入力も実際のパッケージ構成に更新する。
