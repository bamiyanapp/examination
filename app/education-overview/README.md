# 教育: 受験の面接対策（概要、examination app）

教育セクションの概要ページ（`/education/`）を表示するReact（Vite）アプリ（[Issue #92](https://github.com/bamiyanapp/examination/issues/92)）。

MkDocs静的サイトの`/education/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/EducationOverview.jsx`。

見た目はTailwind CSS + daisyUI（[Issue #114](https://github.com/bamiyanapp/examination/issues/114)）で整えている。

- 旧`knowledge/education/index.md`をReact化した
- 鈴木家固有の情報（家族名入りのチェックリスト・特定の実施日・家族プロフィールへのリンク等）は排除し、どの家族・どの受験にも通用する汎用的な方法論（想定問題＋模擬面接記録の2本柱運用、運用フロー、Claude Codeとの模擬面接の進め方）のみを掲載する

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
