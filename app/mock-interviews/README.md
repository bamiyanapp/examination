# 模擬面接記録（examination app）

模擬面接（練習セッション）の記録をAIサマリーで一覧閲覧できるReact（Vite）アプリ（[Issue #103](https://github.com/bamiyanapp/examination/issues/103)）。

MkDocs静的サイトの`/education/mock-interviews/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/MockInterviews.jsx`。

- 旧: `knowledge/education/mock-interviews.md`に手書きされていた記録をMkDocsで表示していたのをやめ、DynamoDB（`examination-mock-interviews`）を正本とする画面へ置き換えた（[Issue #93](https://github.com/bamiyanapp/examination/issues/93)でLINE/音声練習の終了時に自動でサマリーが追記される）
- データはbot-stackの`GET /mock-interviews` API（`interview-questions`と同じ短期トークンで認証）から取得する

## ローカル確認

```
npm install
npm run dev
```

## 検証

```
npm run lint
npm run test
npm run build
```
