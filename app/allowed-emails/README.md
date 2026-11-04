# 閲覧許可メールアドレス管理（examination app）

サイトの閲覧許可メールアドレスを一覧・追加・削除するReact（Vite）アプリ（[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。

MkDocs静的サイトの`/settings/allowed-emails/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/AllowedEmails.jsx`。

見た目はBootstrap 5.3（[Issue #114](https://github.com/bamiyanapp/examination/issues/114)、examination#308でdaisyUIから移行済み）で整えている。

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
