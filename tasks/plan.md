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

- [ ] `infra/site-stack`・`infra/bot-stack`がCIでlint/testされている
- [ ] 重複度チェック・カバレッジ閾値がCIで機能している
- [ ] 上記をmain上のCI実行結果で確認済み

## Checkpoint: #404完了後（全体完了）

- [ ] 主要なユーザーフローについて実バックエンド直結のE2Eテストが存在し、CIで実行されている
- [ ] examination#399の完了条件を全て満たしている

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `checkAuth.js`（認証最前段、900行超）へのテスト追加自体が既存の挙動を変えてしまう | High（家族全員がサイトにアクセスできなくなる） | テスト追加のみを目的とし、本体ロジックは変更しない。変更する場合は最小限に留め、既存の挙動を保つことをテストで担保してからにする |
| `coverage_threshold`を初回から高く設定しすぎ、以後のPRが頻繁にブロックされる | Medium | 実測値を基準に設定し、理想値は後続Issueで段階的に引き上げる（karuta方式） |
| E2Eテストが実バックエンド（本番相当のAWSリソース）に依存し、CIから誤って本番データを変更する | High | `docs/sandboxed-agent-production-data-pattern.md`を参照し、テスト専用データ・クリーンアップ手順を設計する |

## Open Questions

- E2Eテスト（examination#404）が対象とするAWS環境（本番 or テスト用スタック）をどうするか。プロダクトごとに個別のテスト用インフラを持つコストとのバランスを着手時に検討する
