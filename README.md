# examination

家族向けナレッジベース（[Issue #4](https://github.com/bamiyanapp/examination/issues/4)）

## 概要

このリポジトリはGitを正本（Single Source of Truth）とした家族向けナレッジベースです。小学校受験対策のほか、家族マニュアル・保育園・旅行・住まい・車などの情報を`knowledge/`配下のMarkdownで管理し、[MkDocs Material](https://squidfunk.github.io/mkdocs-material/)で静的サイトとしてビルドします（`docs/`はdev-standards共通規約に基づくCI/CD仕様ドキュメント専用のディレクトリのため、サイトコンテンツとは分離している）。

コンテンツはClaude Codeと自分が更新し、GitHub Pushで反映します。妻・子どもなど閲覧側はGitを意識せず、ブラウザからサイトを見るだけで最新の内容を確認できることを目指しています（サイトの公開先・認証は[Issue #6](https://github.com/bamiyanapp/examination/issues/6)で別途整備予定）。

音声対話・管理画面等のインタラクティブなページは、MkDocs静的サイトからReactアプリへ段階移行中です（[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。`app/`配下にページごとの独立したReact（Vite）アプリとしてビルドし、`deploy.yml`でMkDocsが生成した同一URLパスへ成果物を上書き配置します。家族情報・旅行・車等の静的コンテンツページは当面`knowledge/`配下のMarkdownのままです。

## ディレクトリ構成

```
.
├── mkdocs.yml
├── requirements.txt
├── app/                                 # インタラクティブなページごとのReact（Vite）アプリ（Issue #78）
│   ├── line-link/                       # LINE連携（/settings/line-link/）
│   ├── allowed-emails/                  # 閲覧許可メールアドレス管理（/settings/allowed-emails/）
│   ├── voice-practice/                  # 音声で面接練習（/education/voice-practice/）
│   └── top/                             # 新トップページ プレビュー（/top/、Issue #82）
├── docs/
│   └── cicd-pipeline-specification.md  # CI/CD仕様（dev-standards共通規約）
└── knowledge/
    ├── index.md          # サイトのホーム
    ├── education/         # 小学校受験対策（想定問答・模擬面接記録）
    ├── family/             # 家族プロフィール
    ├── childcare/          # 保育園
    ├── travel/             # 旅行
    ├── home/               # 住まい・家電
    ├── cars/               # 車
    └── ai/                 # AI（Claude Code）活用
```

## サイトのローカル確認

```
pip install -r requirements.txt
mkdocs serve
```

## Reactアプリ（app/配下）のローカル確認

```
cd app/line-link       # または app/allowed-emails、app/voice-practice、app/top
npm install
npm run dev
```

## 教育（小学校受験対策）の運用フロー

1. `knowledge/education/`に想定問題と回答案を用意する
2. 想定問題をもとに模擬面接を実施する
3. 実施結果を`knowledge/education/mock-interviews.md`に記録する（気づき・改善点）
4. 記録をもとに想定問答の回答案を更新する
5. 2〜4を本番まで繰り返す

## 家族構成

家族構成は[knowledge/family/profile.md](knowledge/family/profile.md)を参照してください。
