# 新トップページ（examination app、プレビュー中）

サイトの新しいトップページとなるReact（Vite）アプリ（[Issue #82](https://github.com/bamiyanapp/examination/issues/82)）。

段階移行中のため、現時点では`/top/`パスへプレビュー配置し、既存のトップページ（`/`、`knowledge/index.md`）と並行して参照できるようにしている。既存の各ページ（React化済み・MkDocs双方）へのリンク一覧を提供する。動作確認後、旧トップページを廃止して`/`へ切り替える予定（本Issueの検討事項を参照）。

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
