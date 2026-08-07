# AI Cowork

日常生活のタスクをAIと共同で遂行するシステム。設計思想は [docs/technical-design.md](docs/technical-design.md) を参照。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `docs/` | 技術設計書・API仕様書 |
| `db/` | 本番用DBスキーマ（PostgreSQL） |
| `assets/pixel-office/` | 状態可視化UI用ピクセルアート素材（2dPig, CC0） |
| `app/` | バックエンド（Express API + Task DB + Claude Managed Agents連携） |
| `web/` | フロントエンド（Vite + React ダッシュボードUI） |

## ローカルで動かす

```bash
# 1. バックエンド
cd app
npm install
cp .env.example .env        # ANTHROPIC_API_KEY を設定
npm run db:init
npm run agents:setup         # Coordinator AgentとEnvironmentを一度だけ作成
npm run dev                  # http://localhost:3001

# 2. フロントエンド（別ターミナル）
cd web
npm install
npm run dev                  # http://localhost:5173 を開く
```

`ANTHROPIC_API_KEY` 未設定・`agents:setup` 未実行の状態でも両方起動できるが、新しい依頼の送信
（Project作成）は502エラーになる（失敗を偽装しないため。詳細は `app/README.md`）。
