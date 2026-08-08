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

### TEST_MODE（LLM APIを一切使わない動作確認）

`ANTHROPIC_API_KEY`も`agents:setup`も無しに、UI〜API〜Task DB〜通知の一連の流れだけを
確認したい場合は `.env` で有効化する。

```bash
# .env
TEST_MODE=true
```

ONにすると、`POST /api/projects`はManaged Agentsへ一切接続せず、代わりにタスクを1件
「進行中」で作成し、**5秒後に自動で「完了」・結果に`Test Result`をセット**する
（`src/lib/testMode.ts`）。追加メッセージ送信・割り込みも実Sessionを呼ばず`202`を返す。
`npm run dev`は`.env`の変更を検知して自動再起動するため、`TEST_MODE`の切り替えに
サーバーの手動再起動は不要（後述「ホットリロード」）。

### Webhook未設定時の暫定運用（手動Sync）

本番はManaged AgentsのWebhookが`session.status_idled`等をSyncエンドポイントへ通知する設計だが、
ローカル開発でWebhookを公開していない間は、以下のスクリプトで手動同期・状態確認ができる。

```bash
npm run sync -- <session_id>              # Session event履歴をTask DBへ反映（Webhookの代替）
npm run session:status -- <session_id>     # Sessionのstatus・event一覧を確認
npm run session:messages -- <session_id>   # agent.messageのテキストのみ表示
```

`session_id` は `POST /api/projects` のレスポンス（`maSessionId`）または
`SELECT ma_session_id FROM projects` で確認できる。

### モデルの変更

既定モデルは `src/managed-agents/setup.ts` で指定（現在: `claude-haiku-4-5`）。
既存Agentのモデルを変更する場合は新規作成せず更新する：

```bash
# setup.tsのmodelを書き換えたうえで
npm run agents:update-model
```

### ツール定義・システムプロンプトの変更

`customTools.ts` / `systemPrompt.ts` を変更しても、既存のCoordinator Agentには自動反映されない
（Agentは作成時点のスナップショット）。反映するには：

```bash
npm run agents:update-tools
```

### テスト

```bash
npm test   # vitest。Anthropic APIには接続せず、:memory: SQLite + モックで検証する
```

### ホットリロード

`npm run dev`は`tsx watch --include .env`で起動しており、`.ts`ソースの変更（既定の挙動）に加えて
`.env`の変更も検知して自動再起動する。`TEST_MODE`や`ANTHROPIC_API_KEY`を書き換えるたびに
手動で`Ctrl-C`→再起動する必要はない。

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
  （`src/managed-agents/customTools.ts`, `src/lib/sync.ts`）。`update_task_status`は`result`引数
  （実行結果の要約）を受け取り`tasks.result`へ複写する。承認済み外部操作の実行証跡
  （`external_action_logs`）も含め、`GET /api/projects/:id`・Project詳細UIで確認できる
  （完了タスクの実行結果が見えないという既知の欠落への対応。`docs/use-cases.md` UC-05/UC-11）
- **Webhook受信・署名検証**（`client.beta.webhooks.unwrap`、`ANTHROPIC_WEBHOOK_SIGNING_KEY`が必要）
- **Sync層**（`src/lib/sync.ts`）: Session event履歴をTask DB・confirmation_requests・
  notificationsへ反映。`last_synced_event_id`をカーソルに冪等処理
- **Memory Store連携**（ユーザースコープ、初回Project作成時に遅延作成）
- **Outcome対応**（`createProjectSession`に`rubric`を渡すとuser.define_outcomeを送信）
- 確認応答（`native`=agent_toolset/MCPの`always_ask`、`custom`=自前ツール）の分岐実装
- **TEST_MODE**（`src/lib/testMode.ts`）：`.env`の`TEST_MODE=true`でManaged Agentsへの接続を
  完全にバイパスし、5秒後に自動でタスクを完了・`result`に`Test Result`をセットする動作確認モード

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
