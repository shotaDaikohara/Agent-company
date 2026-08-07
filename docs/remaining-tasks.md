# AI Cowork 残タスク一覧

本書は「次に何をすべきか」を一箇所にまとめた実行用バックログ。詳細な実装状況の根拠は
[use-cases.md](use-cases.md)（ユースケース単位の実装状況）と
[system-mechanics.md](system-mechanics.md) 8章（技術設計書からの既知の未到達点）を参照。
状況が変わったら本書・use-cases.md の両方を更新すること。

最終更新: 2026-08-07（Webhook実地動作確認・モデルをhaikuへ変更・result引数によるタスク実行結果の記録、まで完了した時点）

---

## 優先度A：単体で実装・検証できる（外部サービス接続不要）

- [ ] **UC-10 native tool confirmationのTask紐付け** — `agent_toolset`/MCPツールの`permission_policy: always_ask`が発火した際、`agent.tool_use`/`agent.mcp_tool_use`イベントをどのTaskに紐付けるか未確定。現状`sync.ts`はログ出力のみでTask DBに書かない。
  - 補足：現状はどの登録済みツールにも`always_ask`を設定していないため、実際には発火しない（MCPサーバー接続後に必要になる）。優先度A分類だが、実質的な着手はMCP接続（優先度B）とセットで良い。
- [ ] **UC-06 Task木の依存関係・期限のUI描画** — APIは`dependsOn`を返しているが、Project詳細画面（`ProjectDetailView.tsx`）に依存関係の矢印・期限バッジが未描画。
- [ ] **UC-18 記憶内容の閲覧・訂正画面** — Memory Store（userスコープ）は作成済みだが、内容を見る手段がない。まず`GET /api/memory`（読み取り専用）から着手可能。
- [ ] **UC-17 複数Projectの期限・優先度の横断比較** — ダッシュボードで期限が近いProjectを強調する等（Task DBの`due_date`は既にある）。
- [ ] **Scheduled Deployment（期限監視・定期タスクのcron起動）** — `due_date`を能動的にチェックする仕組みがまだない。Managed AgentsのScheduled Deployment APIで実装可能。

## 優先度B：外部サービス接続が必要

- [ ] MCPサーバー（Calendar/Gmail/Drive/Slack等）を`mcp_servers`で接続し、Vaultへ認証情報を登録
- [ ] `execute_external_action`の模擬実行を実際のMCPツール呼び出しに置き換え
- [ ] 上記接続後、優先度AのUC-10（native confirmation）に実質着手

## 優先度C：本番化

- [ ] 認証・複数ユーザー対応（現状`demo-user`固定）
- [ ] SQLite → PostgreSQL移行（`db/schema.sql`は用意済み、アプリ側の接続切替が必要）
- [ ] Push通知（FCM/APNs）。現状はDBの`notifications`テーブルとポーリングのみ
- [ ] **Webhookの恒久化** — 現在はCloudflareの一時トンネル（`cloudflared tunnel --url`）。プロセス再起動でURLが変わり、Console側の再登録が必要になる。固定ドメイン＋常時稼働のホスティングへ移行する
- [ ] multiagent構成（Coordinator Agent + ロースターAgentへの委譲）。現状Coordinator単体

## 優先度D：評価

- [ ] テストシナリオ文書のSC-01〜SC-10を実施していない。特にMVP優先5シナリオ（SC-01, 02, 05, 06, 10）の合格基準を満たすか未検証
- [ ] UC-13 Outcome（rubricベースの完遂判定）— `createProjectSession`は`rubric`引数に対応済みだが、実際のProject作成フロー（`POST /api/projects`）からrubricを渡していないため一度も発火していない

---

## 完了済み（参考）

- ✅ ANTHROPIC_API_KEY設定・Agent/Environment作成・実機での動作確認
- ✅ Coordinator Agentによる実際のタスク自動分解（`create_task`）・進行更新（`update_task_status`、実行結果の`result`引数つき）
- ✅ 確認フロー（`execute_external_action` → 承認/却下 → 実行証跡）
- ✅ Webhook経由の自動Sync（Cloudflare一時トンネル + `webhook-proxy.ts`によるパス制限）
- ✅ モデルを`claude-haiku-4-5`に変更（コスト優先、`npm run agents:update-model`で再変更可能）
- ✅ カイロソフト風オフィスフロアUI
