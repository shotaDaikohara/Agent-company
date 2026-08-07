# AI Cowork ユースケース一覧

## 0. 本書の位置づけ

[technical-design.md](technical-design.md)（R-x/NG-x/SC-xx）と [system-mechanics.md](system-mechanics.md)（実装の現在地）を
突き合わせ、実際に使える／使えない操作の単位で棚卸ししたユースケース一覧。2026-08-07時点のコード（`app/`, `web/`）を根拠とする。
実装状況が変わった場合は本書も更新すること。

状態の意味：

| 状態 | 意味 |
|---|---|
| 実装済み | 経路（UI/API/Sync層/DB）が最後まで通っている |
| 部分実装 | どこかの区間だけ欠けている |
| 未実装 | 経路が存在しない |

---

## 1. ユースケース一覧

| ID | ユースケース | アクター | 関連要求/シナリオ | 状態 | 備考 |
|---|---|---|---|---|---|
| UC-01 | 新規の依頼を送りProjectを起票する | User | R-1, R-7 | 実装済み | `POST /api/projects` → Session作成 |
| UC-02 | Project一覧をオフィスフロアで俯瞰する | User | R-3 | 実装済み | `Dashboard.tsx`、5秒ポーリング |
| UC-03 | ゴールをサブタスクへ分解し登録する | Coordinator Agent | R-1, R-2 | 実装済み | `create_task` カスタムツール |
| UC-04 | タスクの進行状態を更新する（着手/完了/保留） | Coordinator Agent | R-2, R-3 | 実装済み | `update_task_status` カスタムツール |
| UC-05 | 完了したタスクの実行結果・成果物を確認する | User | R-9, R-10, NG-A | 実装済み | `update_task_status` の `result` 引数 → `tasks.result` → Project詳細に表示（本改修で追加） |
| UC-06 | Task木・依存関係・期限をProject詳細で見る | User | SC-02 | 部分実装 | 依存関係はAPIが返すがUI未描画 |
| UC-07 | 会話継続中のProjectへ追加指示を送る | User | SC-05 | 実装済み | `POST /api/projects/:id/messages` |
| UC-08 | 方針変更のため処理を中断する | User | SC-05, NG-J | 実装済み | `POST /api/projects/:id/interrupt` |
| UC-09 | 不可逆操作の実行前確認を承認/却下する（自前ツール経由） | User | R-2, NG-B, SC-06 | 実装済み | `execute_external_action` → `confirmation_requests` |
| UC-10 | agent_toolset/MCPの標準確認（native confirmation）に応答する | User | R-2, NG-B | 未実装 | 検知（`console.warn`）はするがTask DBに反映されない |
| UC-11 | 承認後の実行結果（証跡）を確認する | User | R-9, R-10, NG-A | 実装済み | `external_action_logs` → Project詳細に表示（本改修で追加） |
| UC-12 | 状態変化の通知を一覧・既読にする | User | R-4, NG-E | 実装済み | `NotificationBell.tsx` |
| UC-13 | 完遂条件（Outcome）を満たしProjectが自動的に完了する | System | R-10 | 未実装 | 受信処理はあるが、Project作成時に `rubric` を渡していないためOutcome自体が発火しない |
| UC-14 | ユーザーの基本情報を長期記憶として使い回す | Coordinator Agent | R-6 | 部分実装 | userスコープの作成のみ。projectスコープ・編集画面は未着手 |
| UC-15 | 期限を逆算し遅延を自動検知する | System | SC-02, SC-07 | 未実装 | Scheduled Deployment未導入 |
| UC-16 | カレンダー/メール等の外部サービスと実際に連携する | Coordinator Agent | SC-01, SC-06 | 未実装 | MCP未接続。承認後も模擬実行のみ |
| UC-17 | 複数Projectの期限・優先度を横断比較する | User | SC-10 | 未実装 | — |
| UC-18 | 記憶内容の誤りをユーザーが閲覧・訂正する | User | R-9 | 部分実装 | `GET /api/memory`で閲覧のみ実装（`memoryView.ts`）。訂正（更新/削除）とUI画面は未実装 |

---

## 2. UC-05 / UC-11（本改修で解消したギャップ）の詳細

改修前は、Coordinator Agentがタスクを完了させても「何をしたか」を保存する経路が、ツール定義・DBスキーマ・API・画面のどの段階にも存在しなかった。

- `update_task_status` ツールの引数に `result`（実行結果の要約、任意）を追加した（`app/src/managed-agents/customTools.ts`）。
- `tasks` テーブルに `result` 列を追加した（`app/src/db/schema.sqlite.sql`, `db/schema.sql`）。
- 承認済み外部操作の証跡（`external_action_logs`）を、タスクに紐づく最新1件として取得できるようにした（`repo.getLatestExternalActionLogForTask`）。
- `GET /api/projects/:id` のタスク配列に `result` と `executionLog`（`executedAt` / `result` / `evidence`）を含めた。
- Project詳細画面（`ProjectDetailView.tsx`）に、タスクごとの実行結果・実行証跡（模擬実行である旨を含む）を表示するようにした。

これにより UC-05・UC-11 は「未実装」から「実装済み」へ更新した。テスト状況は [system-mechanics.md](system-mechanics.md) 9章、
実装状況は同8章を参照。

---

## 3. 今回のスコープ外（既知の未着手）

UC-10（native confirmationのTask DB反映）、UC-13（Outcomeのrubric未送信）、UC-14〜UC-18は本改修の対象外。
`system-mechanics.md` 8章「技術設計書からの既知の未到達点」を参照し、着手時は本書のIDと突き合わせること。
