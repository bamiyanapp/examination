# プロフィール編集（examination app）

面接練習（音声対話ページ・LINE bot）で使う「志望先の特色」「その他前提情報」を編集・保存できるReact（Vite）アプリ（[Issue #125](https://github.com/bamiyanapp/examination/issues/125)）。

MkDocs静的サイトの`/settings/profile-edit/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/ProfileEdit.jsx`。

見た目はTailwind CSS + daisyUI（[Issue #114](https://github.com/bamiyanapp/examination/issues/114)）で整えている。

- 以前は音声対話ページ（`app/voice-practice/`）の練習開始フォームで毎回自由入力していたが、練習の度に入力し直すものではないため、この専用画面へ編集機能を移設した
- データはDynamoDB（`examination-family-profile`、bot-stackの`GET/POST /family-profile` API）が唯一の正本。音声対話ページ・LINE botはこの内容を参照するのみで、編集はできない

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
