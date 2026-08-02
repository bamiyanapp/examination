# examination app

音声対話・管理画面等のインタラクティブなページを実装するReact（Vite）アプリ（[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。

MkDocs静的サイト（リポジトリルート）から段階的に移行中。ビルド成果物は`deploy.yml`でMkDocsサイトの同一URLパスへ上書き配置される。

## ページ一覧

- LINE連携（`/settings/line-link/`）: `src/pages/LineLink.jsx`

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
