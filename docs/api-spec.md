# AI Cowork API仕様書（Phase 1）

本書は [technical-design.md](technical-design.md) のBFF層（API/BFF）が公開するREST APIの仕様を定める。クライアント（Web/モバイル）はこのAPIのみと通信し、Claude Managed Agentsとは直接通信しない（認証情報・Vault操作をBFFに閉じ込めるため）。

- ベースURL: `/api`
- 認証: セッションCookie（Phase 1はシングルユーザー前提のため簡略化。Phase 2で複数ユーザー対応時にOAuth2を追加）
- レスポンス形式: JSON、日時はISO 8601（UTC）

---

## 1. Projects（オフィスのデスク＝Project一覧）

### `GET /api/projects`
ダッシュボード表示用のProject一覧を返す。

**Query params**: `status`（`active` | `blocked` | `completed` | `cancelled`。省略時は`cancelled`以外すべて）

**Response 200**
```json
{
  "projects": [
    {
      "id": "uuid",
      "goal": "家族旅行の計画",
      "category": "旅行",
      "status": "active",
      "deadline": "2026-10-13",
      "nextAction": "宿泊候補A・Bの選択、予約実行可否の確認",
      "state": "waiting_confirmation",
      "updatedAt": "2026-08-07T09:00:00Z"
    }
  ]
}
```
`state` はTask木から導出した集約状態（`progress` | `waiting_confirmation` | `done` | `hold`）。ダッシュボードモックアップの状態区分に対応する。

### `POST /api/projects`
新しい依頼を受け取り、Projectを作成する（R-1: 「○○して」の一文で開始）。内部でManaged AgentsのSessionを作成し、Coordinator Agentへ最初の`user.message`を送信する。

**Request**
```json
{ "goal": "10月の連休に家族旅行へ行きたい。計画しておいて。" }
```

**Response 201**
```json
{ "id": "uuid", "status": "active", "maSessionId": "sesn_..." }
```

### `GET /api/projects/:id`
Project詳細（Task木、依存関係、確認待ち事項、直近の中間報告）を返す（R-3の詳細ビュー）。

### `POST /api/projects/:id/messages`
Projectに対して追加のユーザー入力を送る（例：「15万円まで」）。内部で対応するSessionへ`user.message`を送信する。

**Request**: `{ "text": "15万円まで。" }`

### `POST /api/projects/:id/interrupt`
方針変更・割り込み（SC-05）。内部で`user.interrupt`を送信する。

---

## 2. Tasks

### `GET /api/projects/:id/tasks`
Task木を返す（`depends_on`を含む）。

```json
{
  "tasks": [
    {
      "id": "uuid",
      "parentTaskId": null,
      "title": "候補地の比較",
      "status": "in_progress",
      "dueDate": null,
      "dependsOn": []
    }
  ]
}
```

---

## 3. Confirmations（確認・承認フロー、SC-06対応）

### `GET /api/confirmations?status=pending`
確認待ち一覧（複数Project横断）。ダッシュボードのバッジ集計にも使用する。

### `GET /api/confirmations/:id`
確認内容の詳細（金額・日時・条件を1枚のカードに集約したもの）。

### `POST /api/confirmations/:id/respond`
承認/却下する。内部で対応するSessionへ`user.tool_confirmation`を送信する。

**Request**
```json
{ "result": "allow" }
```
または
```json
{ "result": "deny", "message": "候補Bにして" }
```

**Response 200**: 更新後のConfirmationRequest。承認の場合、後続で`external_action_logs`に実行結果が記録され次第、Projectの該当Taskが`done`になる（NG-A対策：確認カードのレスポンス自体は「完了」を意味しない）。

---

## 4. Notifications（R-4）

### `GET /api/notifications?unread=true`
状態変化通知の一覧。

### `POST /api/notifications/:id/read`
既読にする。

---

## 5. Memory（記憶編集画面）

### `GET /api/memory?scope=user`
### `GET /api/projects/:id/memory`
### `PATCH /api/memory/:id`
ユーザーによる記憶の閲覧・訂正（誤った長期記憶混入のガードレール）。

---

## 6. Webhook受信（サーバー内部・Managed Agentsからの着信）

### `POST /api/webhooks/managed-agents`
Managed AgentsからのWebhookを受信し、`client.beta.webhooks.unwrap()`で署名検証したのち、以下のイベントタイプに応じてTask DBを更新し、状態変化があった場合のみ`notifications`を生成する（R-4, NG-E対策）。

| Webhook `data.type` | 処理 |
|---|---|
| `session.status_idled` | 対応するSessionの`stop_reason`を取得し、`requires_action`なら`agent.tool_use`イベントを調べて`confirmation_requests`を作成 |
| `session.outcome_evaluation_ended` | `result`が`satisfied`ならProjectを`completed`に更新し完了通知を作成 |
| `session.status_terminated` | Projectの異常終了検知・再開処理 |

このエンドポイントはクライアントから直接呼ばれない（Anthropicのサーバーからのみ着信）。

---

## エラー形式

```json
{ "error": { "code": "confirmation_not_pending", "message": "この確認は既に処理済みです" } }
```

| HTTPステータス | 用途 |
|---|---|
| 400 | リクエスト不正 |
| 404 | 対象が存在しない |
| 409 | 状態不整合（例：既に処理済みの確認への再応答） |
| 502 | Managed Agents側のエラー（そのまま完了扱いにしない。NG-A対策） |
