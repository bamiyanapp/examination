# CI/CD Pipeline Specification（examination固有）

共通仕様（`reusable-ci.yml` / `reusable-cd.yml`）は [dev-standards/docs/cicd-pipeline-specification.md](../dev-standards/docs/cicd-pipeline-specification.md) を参照する。本ドキュメントにはexamination固有の構成のみを書く。

## CIワークフロー（`.github/workflows/ci.yml`）

本リポジトリはfrontend/backendのアプリケーションコードを持たない家族向けナレッジベースである（MkDocs Material、[Issue #4](https://github.com/bamiyanapp/examination/issues/4)）。そのため`reusable-ci.yml` を以下の構成で呼び出す。

- `packages: "[]"`: lint/test/buildを行うnpmパッケージが無いため、`frontend-test`/`backend-test`/`package-test`のいずれも実行しない
- `enable_standards_check: true`: `dev-standards` submoduleのsymlink欠落・`.gitignore`の内容乖離を検知する
- 実質的に実行されるジョブは `commitlint`（コミットメッセージ・PRタイトルのConventional Commits検証）と `standards-check` のみ

コミットメッセージ検証（`npm ci` → `commitlint`）のため、リポジトリルートに `package.json` を配置している。依存は `@commitlint/cli` / `@commitlint/config-conventional` のみを持つ。

## CDワークフロー（`.github/workflows/cd.yml`、[Issue #137](https://github.com/bamiyanapp/examination/issues/137)）

`main`へのpush時に実行する。構成はdev-standards共通ドキュメントのアーキテクチャ図（`merge job → release job → Deploy jobs`）に合わせる。`release`ジョブと`deploy`ジョブ（`needs: release`）の2つを持つ。

- `release`ジョブ: `reusable-cd.yml`を呼び出す。Conventional Commitsからセマンティックバージョンを算出する（semantic-release）。`enable_shared_release_config: true`で`dev-standards`の共有設定を利用する。参照側の`.releaserc.cjs`から`release-config.cjs`の`buildReleaseConfig()`を`require`する形である。`npmPublish: false`（共有設定の既定）のためnpm公開は行わない。`package.json`のバージョン更新・`CHANGELOG.md`の生成・GitHub Releaseの作成のみ行う
- `deploy`ジョブ: `release`ジョブに依存する（`needs: release`）。これにより、`release`ジョブがmainへ直接push（またはブランチ保護がある場合はPR経由でマージ）したバージョン更新コミットを含む、mainの最新状態を前提にデプロイできる。そのため`actions/checkout@v7`は`ref: main`を明示する。このワークフローの発端になったコミット（`github.sha`）ではなく常にmainの最新を取得する
  - `app/`配下の各Reactアプリのビルド成果物をAWS（S3 + CloudFront + Cognito Google認証）へ自動デプロイする（Issue #6）。AWSリソース自体はTerraformではなくServerless Framework v3系（OSS版）で定義しており、詳細は[infra/README.md](../infra/README.md)を参照する
  - AWSへの認証はIAMユーザーの長期アクセスキー（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`）を使用する（OIDCロールではない）
  - `infra/auth-stack`（Cognito）→ `infra/site-stack`（S3・CloudFront・Lambda@Edge）の順にデプロイする。CloudFrontドメイン確定後に`auth-stack`を再デプロイしてCallback URLを確定させる（`infra/README.md`「なぜ2つのスタックに分けているか」参照）
  - サイト本体は各Reactアプリのビルド成果物を`aws s3 sync`でS3へ同期し、CloudFrontのキャッシュを無効化して反映する（examination#585でMkDocsを廃止済み）
  - トップページ（`app/top`）のビルド時、`release`ジョブが更新した`package.json`のバージョンを`VITE_BUILD_VERSION`として環境変数に設定する。Reactアプリ側（`TopPage.jsx`）でセマンティックバージョンとして表示する（[Issue #131](https://github.com/bamiyanapp/examination/issues/131)のビルドSHA・日時表示と併記）。`docs`/`chore`等バージョンが上がらないコミットではデプロイのたびに値が変わらない。そのため実際に最新がデプロイされたかの確認にはビルドSHA・日時を使う

### 導入の経緯

当初（[Issue #137](https://github.com/bamiyanapp/examination/issues/137)以前）は「本リポジトリはバージョン管理・GitHub Release作成の対象となる配布物を持たないため、`reusable-cd.yml`を適用する意味が無い」と判断していた。そのため専用の`deploy.yml`（`release`ジョブに相当する処理を持たない）のみで運用していた。トップページのバージョン表示（Issue #131）を人間にとって分かりやすいセマンティックバージョン（`vX.Y.Z`）にしたいという要望を受けた。Conventional Commitsから算出したバージョン番号を表示専用の目的で活用する形でsemantic-releaseを導入した。`deploy.yml`は`cd.yml`の`deploy`ジョブへ統合した。
