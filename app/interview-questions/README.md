# 想定問答（examination app）

小学校受験の想定問答を1画面で閲覧できるReact（Vite）アプリ（[Issue #77](https://github.com/bamiyanapp/examination/issues/77)）。

MkDocs静的サイトの`/education/interview-questions/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/InterviewQuestions.jsx`。

- 旧: 本人/父/母で分かれていた`knowledge/education/interview-yosuke.md`・`interview-tomoyo.md`・`interview-ritsu.md`の3ページをMkDocsで個別表示していたのをやめ、1画面に統合した
- データはDynamoDB（`examination-interview-questions`、bot-stackの`GET /interview-questions` API）が唯一の正本。対象者（本人/父/母）で絞り込み表示できる

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
