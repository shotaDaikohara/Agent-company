# AI Cowork — Phase 1 バックエンド

`../docs/technical-design.md` の Phase 1 に対応するスキャフォールド。Task DB（SQLite開発版）+
REST API（Express）+ Claude Managed Agents連携。

## セットアップ

```bash
npm install
cp .env.example .env   # ANTHROPIC_API_KEY を設定（`ant auth login` 済みなら空でも可）

npm run db:init         # Task DBを初期化（デモユーザーを1件作成）
npm run agents:setup    # Coordinator AgentとEnvironmentを一度だけ作成し .managed-agents.json に保存
npm run dev              # http://localhost:3001 でAPIサーバーを起動
```

`npm run agents:setup` は一度だけ実行するセットアップ処理であり、APIサーバーの起動やProject作成の
たびに呼び出してはいけない（Agent/Environmentを作成するたびに新しいIDが増えてしまうため）。
再実行したい場合は `.managed-agents.json` を削除してから実行する。

## 動作確認

```bash
curl http://localhost:3001/api/health

curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"goal": "10月の連休に家族旅行へ行きたい。計画しておいて。"}'
```

`ANTHROPIC_API_KEY` が未設定、または `agents:setup` 未実行の場合、Project作成は
**502 `managed_agents_unavailable`** を返す（偽の成功を返さない設計。NG-A対策）。

## ディレクトリ構成

```
src/
  db/                  Task DB（SQLite開発版）。本番スキーマは ../../db/schema.sql（Postgres）
  managed-agents/      Claude Managed Agents連携（Agent/Session/確認フロー）
  lib/repo.ts          Task DBへのクエリ層
  server/              Express API（docs/api-spec.md に対応）
```

## 未実装（Phase 2以降）

- Webhook受信によるSync層（`agent.tool_use`→`confirmation_requests`への反映、状態変化通知の生成）
- Memory Store（長期記憶）の作成・アタッチ
- MCPサーバー（Calendar/Gmail/Drive/Slack）の`always_ask`権限設定
- Outcome（rubricベースの完遂判定）
- 認証（複数ユーザー対応）
