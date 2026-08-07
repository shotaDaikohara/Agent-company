/**
 * Coordinator Agentに持たせる自前のカスタムツール定義。
 *
 * agent_toolset_20260401 の permission_policy は「custom」タイプのツールには適用されない
 * （Managed Agentsの仕様上、custom toolの実行可否は呼び出し側アプリが自分で制御する）。
 * そこで execute_external_action は、ユーザーが承認するまで意図的に
 * user.custom_tool_result を返さない（＝Sessionをidleのまま保持する）ことで
 * 確認フロー（R-2, NG-B）を実現する。詳細: technical-design.md 2.4, 6章。
 */
export const TASK_BOARD_TOOLS = [
  {
    type: "custom" as const,
    name: "create_task",
    description:
      "Task DBに新しいタスクを作成する。作成したタスクはユーザーのダッシュボードに即座に表示される。" +
      "依頼を実行可能な単位へ分解した際、または作業の過程で新しい作業単位が発生した際に呼ぶこと。",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "タスクのタイトル（簡潔に）" },
        parent_task_id: {
          type: "string",
          description: "親タスクのID。トップレベルのタスクの場合は省略する。",
        },
        due_date: {
          type: "string",
          description: "期限（YYYY-MM-DD形式）。不明な場合は省略する。",
        },
        depends_on_task_ids: {
          type: "array",
          items: { type: "string" },
          description: "このタスクの前に完了しておくべきタスクのIDリスト（前後関係の制御に使う）。",
        },
      },
      required: ["title"],
    },
  },
  {
    type: "custom" as const,
    name: "update_task_status",
    description:
      "既存タスクの状態を更新する。作業を開始したら 'in_progress' に、完了したら 'done' に、" +
      "他タスクの完了待ちで着手できない場合は 'blocked' に、必ず更新すること。" +
      "確認待ちの状態は execute_external_action の呼び出しによって自動的に反映されるため、" +
      "'waiting_confirmation' への更新にこのツールを使う必要はない。",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "更新するタスクのID" },
        status: {
          type: "string",
          enum: ["pending", "in_progress", "blocked", "done"],
        },
      },
      required: ["task_id", "status"],
    },
  },
  {
    type: "custom" as const,
    name: "execute_external_action",
    description:
      "予約・購入・送信・解約・削除・申請提出など、不可逆または高リスクな外部操作を実行する。" +
      "このツールを呼んだ時点では、まだ何も実行されていない。ユーザーが確認画面で承認するまで、" +
      "この呼び出しへの応答（実行結果）は返ってこない。承認/却下が返るまで、この操作を" +
      "実行済みとして扱ったり、ユーザーに完了したかのように伝えたりしないこと。",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "関連するタスクのID" },
        reason: {
          type: "string",
          enum: ["irreversible", "high_risk", "value_judgment"],
          description: "確認が必要な理由の分類",
        },
        action_summary: {
          type: "string",
          description:
            "ユーザーに提示する操作内容の要約。金額・日時・対象・条件など、判断に必要な情報を含めること。",
        },
        risk_detail: {
          type: "string",
          description: "キャンセル条件・解約条件などの補足情報（任意）。",
        },
      },
      required: ["task_id", "reason", "action_summary"],
    },
  },
];

export const TASK_BOARD_TOOL_NAMES = TASK_BOARD_TOOLS.map((t) => t.name);
