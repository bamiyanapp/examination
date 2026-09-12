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
   - **採用（examination#414実装時に確定）**: 既存の単一`ci:`job呼び出し（`packages`・`enable_standards_check`・`enable_duplication_check`を指定済み）の`with:`へ、`enable_e2e_test: true`・`frontend_dir: app/<name>`をそのまま追加する。`frontend-e2e-test`ジョブは`inputs.enable_e2e_test`のみで動作し`packages`（package-testジョブ）とは独立した条件のため、既存jobへの追加だけで両立できる
   - **却下**: 対象アプリごとに`reusable-ci.yml`を2つ目の`uses:`で個別に呼び出す方式（計画時点の案）。実装時に検証した結果、`reusable-ci.yml`の`merge`job（自動マージ判定）は**同一ワークフロー呼び出し内の`needs`のみ**を見るため、2つ目の呼び出しを追加すると片方の`merge`jobがもう片方のE2E結果を待たずにマージしてしまう不具合になることが判明し、この案は不採用にした
   - **却下**: `reusable-ci.yml`自体のマトリクス対応拡張（影響範囲が大きすぎるため一旦見送り、将来的にE2E対象アプリが増え続ける場合に改めて検討する）
2. **AWS環境は本番のみ**: `site-stack`・`bot-stack`とも専用のテスト用スタックが存在しない（`infra/README.md`参照）。dev-standards `docs/client-only-vite-spa-pattern.md`の「E2Eはモックを作らず実際のAPIへ直結する」原則に従い、本番環境に対して実行する
   - 本番データ保護のため、**専用のE2Eテスト用ユーザー・専用の家族（family）レコード**を用意し、E2Eが作成・変更するデータをこの専用家族のスコープ内に限定する。実在の家族データには一切触れない
   - `examination-allowed-emails`・`examination-families`テーブルへの書き込みを伴うテスト（`family-create`・`allowed-emails`の追加/削除）は、テスト自体が後片付け（作成したレコードの削除）を行う、またはテスト用データと分かるプレフィックス（例: `e2e-test-`）を付けて残しても実害が無い設計にする
3. **認証はCognitoネイティブユーザー（Googleアカウント不要）＋`AdminInitiateAuth`で完結させる**（ユーザーからのフィードバックにより、当初案「専用Googleアカウント作成＋一度きりの手動ログイン」から変更）。
   - `auth-stack`の`UserPool`は現状Googleフェデレーションのみを許可し（`SupportedIdentityProviders: [Google]`）、既存の`UserPoolClient`の`ExplicitAuthFlows`はパスワード認証を一切許可していない（`ALLOW_USER_SRP_AUTH`・`ALLOW_REFRESH_TOKEN_AUTH`のみ、serverless.ymlのコメント「Googleアカウントによるログインのみを許可する（パスワード認証は提供しない）」参照）。**この一般公開のログイン経路（Hosted UI）は一切変更しない**
   - 既存`UserPoolClient`の`ExplicitAuthFlows`へ`ALLOW_ADMIN_USER_PASSWORD_AUTH`を追加する。この認証フローは`AdminInitiateAuth`（IAM認証済みのサーバー間API呼び出しでのみ利用可能。`InitiateAuth`のような公開エンドポイントからは呼べない）専用で、Hosted UIや一般公開のログイン画面には一切露出しない。「Googleアカウントによるログインのみを許可する」という公開ログイン経路の性質は変わらない（examination#413で実機検証済み）
   - 同一User Pool内にネイティブ（Googleと紐付かない）のE2Eテスト専用ユーザーを1つ作成する（`AdminCreateUser`＋`AdminSetUserPassword`、パスワードはGitHub Secretsで管理）
   - **（examination#414実装時に静的secret方式へ変更）** 計画段階では「CI実行のたびに`AdminInitiateAuth`をその場で呼びid_token・refresh_tokenをjob outputで`frontend-e2e-test`ジョブへ渡す」設計だったが、実機検証でGitHub Actionsの仕様上不可能と判明した。**あるジョブがマスク対象の値（AWS認証情報等のsecrets、`::add-mask::`した値）に一度でも触れると、そのジョブの`outputs`はジョブ単位で無条件に空文字へ差し替えられる**（`##[warning]Skip output '...' since it may contain secret.`）。個別の出力値だけマスクを外しても、ジョブ内の他の値（AWS認証情報等）が自動マスクされている限りこの制約から逃れられない
   - 上記の理由により、**`e2e-prep-top`のようなCI内その場発行ジョブを廃止**し、`E2E_BASE_URL`（CloudFrontドメイン、作成後不変）と`E2E_REFRESH_TOKEN`（テストユーザーに対し事前に1回`AdminInitiateAuth`で取得）を1つのJSON文字列にまとめた**静的なGitHub Secret（`E2E_SECRETS_JSON`）**として`ci.yml`から直接参照する方式に変更した。取得は`setup-e2e-test-fixtures.yml`（examination#413で導入済みのワンショットワークフロー）へ専用ステップを追加し、Job Summaryへ組み立て済みJSONを平文表示して人間が手動でSecretへ登録する（refresh_tokenの有効期限が切れたら再実行・再登録する運用）
   - **Playwright側のCookie注入はrefresh_tokenのみ**（`id_token`は注入しない）。`checkAuth.js`自身が既に持つ「`id_token`が無い/無効でも`refresh_token`が有効なら裏側で新しい`id_token`を再発行しリダイレクトする」既存の再認証フローにそのまま乗る設計にした。実際のリピーターユーザーの挙動に近く、`id_token`の短い有効期限切れを気にする必要も無い
   - 発行された`id_token`・`refresh_token`は同一User Pool・同一`UserPoolClient`（既存の本番clientId）から発行されるため、`checkAuth.js`のJWT検証（issuer・audience・JWKS署名）を一切変更する必要が無い。**checkAuth.js自体には手を加えない**
   - 一連のセットアップ（IAMポリシー・ネイティブユーザー作成・refresh_token取得）はいずれもコード化・`workflow_dispatch`で実行でき、**Googleアカウントの新規作成やCognito Hosted UI経由の手動ログインは不要**になった

### Task List（GitHub Issuesで管理、examination#404の子Issue）

1. examination#413: `auth-stack`の既存`UserPoolClient`へ`ALLOW_ADMIN_USER_PASSWORD_AUTH`を追加し、E2Eテスト専用のネイティブCognitoユーザー・家族レコードを作成する（`AdminCreateUser`等、`workflow_dispatch`でコード化。人間の手動ログイン操作は不要）。テストユーザーのパスワードをGitHub Secretsへ登録する
2. examination#414: 共有Playwright認証ヘルパー（事前取得済みの`refresh_token`を静的secret `E2E_SECRETS_JSON`経由で受け取り`context.addCookies()`で注入する）とスクリーンショットヘルパー（`shared/e2e/screenshot.js`のsymlink導入）を整備し、既存の`ci.yml`単一`ci`jobへ`enable_e2e_test: true`・`frontend_dir: app/top`（認証必須の中で最も単純な画面）を追加してパイプライン全体（認証→保護ページ表示→スクリーンショット→Job Summary/PRコメント）が動くことを実証する。**完了・main反映済み**（PR #428）。実装過程で判明した2つの重要な知見:
   - GitHub Actionsのjob output仕様（マスク対象値に触れたジョブのoutputsは無条件に空文字化される）により、当初計画の「CI実行のたびにその場でトークン発行」は不可能と判明し、静的secret方式へ設計変更した（詳細は上記「調査結果・アーキテクチャ決定」3.参照）
   - `setup-e2e-test-fixtures.yml`（examination#413）の`examination-allowed-emails`・`examination-families`の既存判定ロジック（`aws dynamodb get-item --query "Item" --output text | grep -q .`）に、レコード不在時の戻り値`"None"`を「存在する」と誤判定するバグがあり、**examination#413導入以来一度もシードが実際には実行されていなかった**（E2Eテストユーザーが常に許可外と判定され`/family-create/`へリダイレクトされる根本原因だった）。`--output json`で`"Item"`キーの有無をjqで判定する方式に修正済み
3. examination#415〜#419: 残り5アプリ（`voice-practice`・`interview-questions`・`mock-interviews`・`allowed-emails`・`family-create`）へ、#414で確立したパターンに沿ってE2Eテスト・CI jobを追加する（アプリごとに独立、並行着手可）

### Checkpoint: #413〜#414完了後

- [x] `AdminInitiateAuth`ベースのE2E認証がCIで機能し、保護ページのスクリーンショットがJob Summary・PRコメントに表示される
- [x] 上記をmain上のCI実行結果で確認済み（PR #428マージ後、main push時のCI/CDがいずれも成功。app/topトップページで「教育」「設定」を含む実際の画面がスクリーンショットに表示されることを確認）

### Checkpoint: 全アプリ完了後（examination#404完了）

- [ ] 対象5アプリすべてで主要ユーザーフローのE2Eテストが存在しCIで実行されている
- [ ] examination#399の完了条件を全て満たしている（examination#399をクローズする）
