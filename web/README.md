# AI Cowork — Web UI（Phase 1）

`../app`（Express API, :3001）に接続するダッシュボードUI。Vite + React + TypeScript。

## セットアップ・起動

```bash
npm install
npm run dev   # http://localhost:5173
```

`/api/*` へのリクエストは `vite.config.ts` の proxy 設定により `http://localhost:3001` へ転送される
（CORS設定は不要）。先に `../app` 側のAPIサーバーを起動しておくこと。

## 画面構成

- **ダッシュボード**：Project一覧（ピクセルオフィス風カード）、新規依頼フォーム、確認待ちパネル、通知ベル
- **Project詳細**：Task一覧、追加メッセージ送信、方針変更・中断

## 素材

`src/assets/` のピクセルアートは `../assets/pixel-office/`（2dPig, CC0）から状態別に切り出したもの。
