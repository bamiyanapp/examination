# examination app

複数家族対応（[Issue #44](https://github.com/bamiyanapp/examination/issues/44)）の家族新規作成ページ（[Issue #242](https://github.com/bamiyanapp/examination/issues/242)・[Issue #258](https://github.com/bamiyanapp/examination/issues/258)）。公開登録制で、Googleアカウントでログインしていれば誰でも利用できる。

MkDocs静的サイト（リポジトリルート）から段階的に移行中。ビルド成果物は`cd.yml`でMkDocsサイトの同一URLパス（`/family-create/`）へ上書き配置される。

見た目はTailwind CSS + daisyUI（[Issue #114](https://github.com/bamiyanapp/examination/issues/114)）で整えている。

他のアプリと異なり、PWA化（manifest.json・Service Worker）や`UserMenu`等の共通コンポーネントは含めていない。このページの訪問者は他ページが前提とする`isAllowedEmail`（サイトへの許可済みメールアドレス）をまだ満たしていないユーザーそのものであり、これらのコンポーネントが依存するAPI（`/_me`・`/_voice-token`等）は機能しないため（詳細は`src/App.jsx`のコメント参照）。

## ページ一覧

- 家族の新規作成（`/family-create/`）: `src/pages/FamilyCreate.jsx`

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
