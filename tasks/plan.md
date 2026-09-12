# Implementation Plan: 開発共通のテスト観点の適用（examination#399）

## Overview

`infra/site-stack`・`infra/bot-stack`にはvitest・lintが未導入で、CI（`ci.yml`）の対象外。E2Eテスト（Playwright）も`app/`配下のどのアプリにも存在しない。`enable_duplication_check`・`coverage_threshold`も未設定。dev-standards `docs/standard-tech-stack.md`が明記する「バックエンドAPIを持つ場合はPlaywrightによる実バックエンド直結のE2Eも行う」を満たしていない状態を解消する。

タスクはGitHub Issues（examination#399の子Issue）で管理する。本ファイルは子Issue一覧のインデックスと設計判断の記録に用いる。

## Architecture Decisions

- テストランナーはリポジトリ内の他パッケージ（`app/*`）と統一し、vitest + oxlintを採用する
- `infra/site-stack`・`infra/bot-stack`は独立したLambda（1関数1ファイル）構成のため、`dailyRateLimit.js`等の既存の共有ロジック抽出パターン（dev-standards `shared/lambda/`）を参考に、まずは各ハンドラファイル単位でテストを追加する（大規模なリファクタリングは行わない）
- `enable_duplication_check`は既存コードへの変更を伴わない静的解析の有効化のみのため、依存が無く最初に着手できる
- `coverage_threshold`の具体的な閾値は、テスト追加後に実測した値を基準に設定する（karuta#806・#833・#877の先例と同様、後から引き上げる方式を取り、初回導入時に理想値を無理に狙わない）

## Task List（GitHub Issuesで管理、examination#399の子Issue）

1. examination#400: `enable_duplication_check`を有効化する（jscpd導入、依存なし）
2. examination#401: `infra/bot-stack`へvitest・lintを導入し既存14ハンドラのユニットテストを整備する
3. examination#402: `infra/site-stack`へvitest・lintを導入し`checkAuth.js`のユニットテストを整備する
4. examination#403: `ci.yml`の`packages`マトリクスへ`infra/site-stack`・`infra/bot-stack`を追加し、実測値に基づき`coverage_threshold`を設定する（#401・#402に依存）
5. examination#404: バックエンドAPIを呼ぶ`app/`配下のアプリへPlaywright E2Eテストを導入する（`voice-practice`・`interview-questions`・`mock-interviews`・`allowed-emails`・`family-create`等。着手時にアプリ単位でさらに分解する）

## Checkpoint: #400〜#403完了後

- [x] `infra/site-stack`・`infra/bot-stack`がCIでlint/testされている
- [x] 重複度チェック・カバレッジ閾値がCIで機能している
- [x] 上記をmain上のCI実行結果で確認済み（PR #411マージ後のmain push-to-main CI
      [run 34661392334](https://github.com/bamiyanapp/examination/actions/runs/34661392334)で
      `infra/bot-stack, 50`・`infra/site-stack, 75`を含む全ジョブの成功を確認）

## Checkpoint: #404完了後（全体完了）

- [ ] 主要なユーザーフローについて実バックエンド直結のE2Eテストが存在し、CIで実行されている
- [ ] examination#399の完了条件を全て満たしている

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `checkAuth.js`（認証最前段、900行超）へのテスト追加自体が既存の挙動を変えてしまう | High（家族全員がサイトにアクセスできなくなる） | テスト追加のみを目的とし、本体ロジックは変更しない。変更する場合は最小限に留め、既存の挙動を保つことをテストで担保してからにする |
| `coverage_threshold`を初回から高く設定しすぎ、以後のPRが頻繁にブロックされる | Medium | 実測値を基準に設定し、理想値は後続Issueで段階的に引き上げる（karuta方式） |
| E2Eテストが実バックエンド（本番相当のAWSリソース）に依存し、CIから誤って本番データを変更する | High | `docs/sandboxed-agent-production-data-pattern.md`を参照し、テスト専用データ・クリーンアップ手順を設計する |
| `auth-stack`の`UserPoolClient`へ`ALLOW_ADMIN_USER_PASSWORD_AUTH`を追加する変更が、意図せず一般公開ログイン経路（Googleのみ）の性質を弱めてしまう | High（認証基盤の根幹） | `ALLOW_ADMIN_USER_PASSWORD_AUTH`はAWS Cognitoの仕様上`AdminInitiateAuth`（IAM認証済みAPI呼び出し専用）でのみ有効で、公開エンドポイント`InitiateAuth`・Hosted UIからは呼び出せない設計になっている。examination#413の実装時にAWS公式ドキュメント・実機検証（テスト用IAMユーザーでの`InitiateAuth`呼び出しが拒否されることの確認）で裏取りしてから本番へ適用する。GitHub ActionsのIAM権限はこのAPI・対象UserPool/UserPoolClientに最小権限で限定する |

## Open Questions

- E2Eテスト（examination#404）が対象とするAWS環境（本番 or テスト用スタック）をどうするか。プロダクトごとに個別のテスト用インフラを持つコストとのバランスを着手時に検討する
  → 下記「examination#404: Playwright E2E導入 詳細計画」で調査した結果、examinationは`site-stack`・`bot-stack`ともに単一環境（本番のみ）で、専用のテスト用スタックは存在しない（`infra/README.md`参照）。dev-standards `docs/client-only-vite-spa-pattern.md`の「E2Eはモックを作らず実際のAPIへ直結する」原則に従い、本番環境に対して**専用のE2Eテストユーザー（Cognitoネイティブユーザー、Googleアカウント不要）**を作成し実行する方針とする（詳細は下記参照）。専用テスト用スタックを別途構築するコストは、家族向け個人プロダクトの規模ではリターンに見合わないと判断した

## examination#404: Playwright E2E導入 詳細計画

### Overview

`app/`配下の5アプリ（`voice-practice`・`interview-questions`・`mock-interviews`・`allowed-emails`・`family-create`）はいずれも`infra/bot-stack`・`infra/site-stack`のバックエンドAPIを呼ぶが、E2Eテストが一切無い。加えて、サイト全体がCognito+Google認証（Lambda@Edge `checkAuth.js`）でゲートされているため、**未認証で到達できるページが1つも存在しない**（トップページ含め、有効な`id_token`が無ければ必ずCognitoログイン画面へリダイレクトされる）。この事実により、E2E導入は認証基盤の整備と不可分である。

### 調査結果・アーキテクチャ決定

1. **reusable-ci.ymlの`frontend-e2e-test`ジョブはマトリクス非対応**: `enable_e2e_test`・`frontend_dir`はいずれも単一値の入力で、`packages`（package-testジョブ）のようなマトリクス構成に対応していない（`docs/cicd-pipeline-specification.md`「1. CIワークフロー」参照）。dev-standards側（`reusable-ci.yml`自体）を拡張してマトリクス対応させる案も検討したが、複数の参照側リポジトリ（karuta等）に影響する共有インフラの変更は影響範囲・レビューコストが大きい。
   - **採用**: examination側の`ci.yml`に、対象アプリ1つにつき1つの追加job（`uses: .../reusable-ci.yml@v2.12.1`を`enable_e2e_test: true`・`frontend_dir: app/<name>`で個別に呼び出し、`packages`・`enable_standards_check`・`enable_duplication_check`はいずれも指定しない＝既存の`ci` jobとは完全に独立させる）を追加する方式を取る。dev-standards側は変更しない
   - **却下**: `reusable-ci.yml`自体のマトリクス対応拡張（影響範囲が大きすぎるため一旦見送り、将来的にE2E対象アプリが増え続ける場合に改めて検討する）
2. **AWS環境は本番のみ**: `site-stack`・`bot-stack`とも専用のテスト用スタックが存在しない（`infra/README.md`参照）。dev-standards `docs/client-only-vite-spa-pattern.md`の「E2Eはモックを作らず実際のAPIへ直結する」原則に従い、本番環境に対して実行する
   - 本番データ保護のため、**専用のE2Eテスト用ユーザー・専用の家族（family）レコード**を用意し、E2Eが作成・変更するデータをこの専用家族のスコープ内に限定する。実在の家族データには一切触れない
   - `examination-allowed-emails`・`examination-families`テーブルへの書き込みを伴うテスト（`family-create`・`allowed-emails`の追加/削除）は、テスト自体が後片付け（作成したレコードの削除）を行う、またはテスト用データと分かるプレフィックス（例: `e2e-test-`）を付けて残しても実害が無い設計にする
3. **認証はCognitoネイティブユーザー（Googleアカウント不要）＋`AdminInitiateAuth`で完結させる**（ユーザーからのフィードバックにより、当初案「専用Googleアカウント作成＋一度きりの手動ログイン」から変更）。
   - `auth-stack`の`UserPool`は現状Googleフェデレーションのみを許可し（`SupportedIdentityProviders: [Google]`）、既存の`UserPoolClient`の`ExplicitAuthFlows`はパスワード認証を一切許可していない（`ALLOW_USER_SRP_AUTH`・`ALLOW_REFRESH_TOKEN_AUTH`のみ、serverless.ymlのコメント「Googleアカウントによるログインのみを許可する（パスワード認証は提供しない）」参照）。**この一般公開のログイン経路（Hosted UI）は一切変更しない**
   - 既存`UserPoolClient`の`ExplicitAuthFlows`へ`ALLOW_ADMIN_USER_PASSWORD_AUTH`を追加する。この認証フローは`AdminInitiateAuth`（IAM認証済みのサーバー間API呼び出しでのみ利用可能。`InitiateAuth`のような公開エンドポイントからは呼べない）専用で、Hosted UIや一般公開のログイン画面には一切露出しない。「Googleアカウントによるログインのみを許可する」という公開ログイン経路の性質は変わらない
   - 同一User Pool内にネイティブ（Googleと紐付かない）のE2Eテスト専用ユーザーを1つ作成する（`AdminCreateUser`＋`AdminSetUserPassword`、パスワードはGitHub Secretsで管理）。CI実行のたびに`AdminInitiateAuth`（IAM認証、GitHub Actionsに`aws-actions/configure-aws-credentials`で付与、`docs/sandboxed-agent-production-data-pattern.md`と同じ「実行ロジックはコード化しGitHub Actions側に委ねる」方式）でこのユーザーの`id_token`・`refresh_token`をその場で発行させる。長期間有効なトークンをSecretsへ保管する必要が無くなる（当初案の`E2E_SECRETS_JSON`によるrefresh_token保管より安全）
   - 発行された`id_token`は同一User Pool・同一`UserPoolClient`（既存の本番clientId）から発行されるため、`checkAuth.js`のJWT検証（issuer・audience・JWKS署名）を一切変更する必要が無い。**checkAuth.js自体には手を加えない**
   - 一連のセットアップ（IAMポリシー・ネイティブユーザー作成）はいずれもコード化・`workflow_dispatch`で実行でき、**Googleアカウントの新規作成やCognito Hosted UI経由の手動ログインは不要**になった

### Task List（GitHub Issuesで管理、examination#404の子Issue）

1. examination#413: `auth-stack`の既存`UserPoolClient`へ`ALLOW_ADMIN_USER_PASSWORD_AUTH`を追加し、E2Eテスト専用のネイティブCognitoユーザー・家族レコードを作成する（`AdminCreateUser`等、`workflow_dispatch`でコード化。人間の手動ログイン操作は不要）。テストユーザーのパスワードをGitHub Secretsへ登録する
2. examination#414: 共有Playwright認証ヘルパー（CI実行時に`AdminInitiateAuth`でid_token・refresh_tokenをその場で発行し`context.addCookies()`で注入する）とスクリーンショットヘルパー（`shared/e2e/screenshot.js`のsymlink導入）を整備し、`ci.yml`に最初の1アプリ（`app/top`、認証必須の中で最も単純な画面）分のE2E CI job（`frontend-e2e-test`個別呼び出し。AWS認証情報の設定ステップを追加）を追加してパイプライン全体（認証→保護ページ表示→スクリーンショット→Job Summary/PRコメント）が動くことを実証する
3. examination#415〜#419: 残り5アプリ（`voice-practice`・`interview-questions`・`mock-interviews`・`allowed-emails`・`family-create`）へ、#414で確立したパターンに沿ってE2Eテスト・CI jobを追加する（アプリごとに独立、並行着手可）

### Checkpoint: #413〜#414完了後

- [ ] `AdminInitiateAuth`ベースのE2E認証がCIで機能し、保護ページのスクリーンショットがJob Summary・PRコメントに表示される
- [ ] 上記をmain上のCI実行結果で確認済み

### Checkpoint: 全アプリ完了後（examination#404完了）

- [ ] 対象5アプリすべてで主要ユーザーフローのE2Eテストが存在しCIで実行されている
- [ ] examination#399の完了条件を全て満たしている（examination#399をクローズする）
