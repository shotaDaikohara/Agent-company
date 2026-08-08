# AI Cowork

日常生活のタスクをAIと共同で遂行するシステム。設計思想は [docs/technical-design.md](docs/technical-design.md)、
実装の実際の動作機序（イベント・データの流れ）は [docs/system-mechanics.md](docs/system-mechanics.md)、
ユースケース単位での実装・未実装の棚卸しは [docs/use-cases.md](docs/use-cases.md) を参照。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `docs/` | 技術設計書・動作機序設計書・ユースケース一覧・API仕様書 |
| `db/` | 本番用DBスキーマ（PostgreSQL） |
| `assets/pixel-office/` | 状態可視化UI用ピクセルアート素材（2dPig, CC0） |
| `app/` | バックエンド（Express API + Task DB + Claude Managed Agents連携） |
| `web/` | フロントエンド（Vite + React ダッシュボードUI） |
| `ai-office/` | **別プロジェクト**。ChatGPT Pure Plugin版（MCP Server + React UI）。下記参照 |

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

## AI Office（別プロジェクト）

`ai-office/` は上記「AI Cowork」（Anthropic Managed Agents版）とは別系統の、**ChatGPT Pure
Plugin**として案件管理を提供する構成。Claude Managed AgentsもAnthropic APIも使わず、独自LLM
APIを一切呼ばない点が異なる。設計の正本はGoogle Drive「AI Office 基本設計（Pure Plugin版）」。
セットアップ・実装状況は [ai-office/README.md](ai-office/README.md) / [ai-office/TASKS.md](ai-office/TASKS.md) 参照。
