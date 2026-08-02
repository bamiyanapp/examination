# 音声で面接練習（examination app）

ブラウザの音声認識・音声合成機能を使って声に出しながら面接練習ができるReact（Vite）アプリ（[Issue #62](https://github.com/bamiyanapp/examination/issues/62)、[Issue #76](https://github.com/bamiyanapp/examination/issues/76)、[Issue #78](https://github.com/bamiyanapp/examination/issues/78)）。

MkDocs静的サイトの`/education/voice-practice/`パスへビルド成果物を上書き配置する。実装本体は`src/pages/VoicePractice.jsx`。

- チャット風UIでユーザー自身の発言（音声認識結果）とAI応答の両方を表示する
- シチュエーション・志望先の特色を自由入力でき、小学校受験に限らない汎用的な面接練習に対応する

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
