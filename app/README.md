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

## 実装状況

### 実装済み・動作確認済み
- Task DB（SQLite開発版）とスキーマ初期化
- Managed Agents連携（Agent/Environment作成、Session作成、メッセージ送信、割り込み）
- **タスク管理カスタムツール**（`create_task` / `update_task_status` / `execute_external_action`）
  — CoordinatorがTask DBへ状態を反映させる手段。`execute_external_action`は承認されるまで
  `user.custom_tool_result`を意図的に返さないことで確認フロー（R-2, NG-B）を実現している
  （`src/managed-agents/customTools.ts`, `src/lib/sync.ts`）
- **Webhook受信・署名検証**（`client.beta.webhooks.unwrap`、`ANTHROPIC_WEBHOOK_SIGNING_KEY`が必要）
- **Sync層**（`src/lib/sync.ts`）: Session event履歴をTask DB・confirmation_requests・
  notificationsへ反映。`last_synced_event_id`をカーソルに冪等処理
- **Memory Store連携**（ユーザースコープ、初回Project作成時に遅延作成）
- **Outcome対応**（`createProjectSession`に`rubric`を渡すとuser.define_outcomeを送信）
- 確認応答（`native`=agent_toolset/MCPの`always_ask`、`custom`=自前ツール）の分岐実装

### 未実装・既知の制約（実際の外部サービス連携・認証情報・デプロイが必要なため）
- **MCPサーバー（Calendar/Gmail/Drive/Slack等）の実接続**：MCPサーバーURLとVaultへのOAuth
  認証情報登録が必要。現状`execute_external_action`は「模擬実行」（承認後、実際には何も
  実行せず証跡だけ記録）に留まる。UI側で「模擬」であることを明示する運用が前提（NG-A対策）。
- **agent_toolset/MCPツールのnative confirmation**：`agent.tool_use`の`evaluated_permission:
  "ask"`をどのTaskに紐付けるかの設計が未確定（custom toolのように`task_id`を引数で
  受け取れないため）。現状はログ出力のみでDBには書き込まない。
- **認証・複数ユーザー対応**：現状シングルユーザー固定（`demo-user`）
- **本番デプロイ**：PostgreSQL（`db/schema.sql`）への切り替え、Web/モバイルクライアント本体、
  Push通知配信（FCM/APNs）は未着手
- **Webhookエンドポイントの公開**：ローカル開発では`ngrok`等でトンネリングし、
  Anthropic Consoleでエンドポイント登録・`ANTHROPIC_WEBHOOK_SIGNING_KEY`取得が必要
