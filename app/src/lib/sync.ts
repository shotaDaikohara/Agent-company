import { randomUUID } from "node:crypto";
import { repo, type ProjectRow } from "./repo.js";
import { listSessionEvents, respondCustomToolResult } from "../managed-agents/session.js";
import { TASK_BOARD_TOOL_NAMES } from "../managed-agents/customTools.js";

/**
 * Sync層: Managed AgentsのSession event履歴をTask DBへ反映する。
 * technical-design.md 2.9「Scheduled Deployment + Sync層」に対応。
 *
 * Webhook（session.status_idled 等）をトリガーに呼び出す想定。冪等性は
 * projects.last_synced_event_id をカーソルとして未処理イベントのみ処理することで担保する。
 */
export async function processSessionEvents(project: ProjectRow): Promise<{
  processedCount: number;
  notifications: Array<{ type: string; title: string }>;
}> {
  const events = await listSessionEvents(project.ma_session_id);

  const startIndex = project.last_synced_event_id
    ? events.findIndex((e) => "id" in e && e.id === project.last_synced_event_id) + 1
    : 0;
  const pending = events.slice(Math.max(startIndex, 0));

  const notifications: Array<{ type: string; title: string }> = [];
  let lastEventId: string | undefined;

  for (const event of pending) {
    if ("id" in event) lastEventId = event.id;

    switch (event.type) {
      case "agent.custom_tool_use": {
        await handleCustomToolUse(project, event, notifications);
        break;
      }
      case "agent.tool_use":
      case "agent.mcp_tool_use": {
        // agent_toolset/MCPツールの always_ask はPhase 2（実MCPサーバー導入）で扱う。
        // task_idとの紐付け方法が未確定のため、現時点では検知のみ行いDBには書き込まない。
        if ("evaluated_permission" in event && event.evaluated_permission === "ask") {
          console.warn(
            `[sync] project=${project.id} で ${event.type} が確認待ちになりましたが、` +
              `native tool confirmationのTask DB反映はPhase 2で実装予定です (event=${
                "id" in event ? event.id : "?"
              })`,
          );
        }
        break;
      }
      case "span.outcome_evaluation_end": {
        if (event.result === "satisfied") {
          repo.updateProjectStatus(project.id, "completed");
          notifications.push({ type: "completion", title: "Projectが完了しました" });
        } else if (event.result === "failed") {
          notifications.push({
            type: "problem",
            title: "完遂条件を満たせませんでした。内容を確認してください。",
          });
        }
        break;
      }
      case "session.status_terminated": {
        // 異常終了の可能性。Phase 2でリトライ/再開ロジックを追加する。
        notifications.push({ type: "problem", title: "Sessionが終了しました。状態を確認してください。" });
        break;
      }
      default:
        // agent.message / agent.thinking 等は実況に相当するため、通知は生成しない（R-4, NG-E）。
        break;
    }
  }

  if (lastEventId) {
    repo.updateProjectSyncCursor(project.id, lastEventId);
  }

  for (const n of notifications) {
    repo.insertNotification({
      id: randomUUID(),
      project_id: project.id,
      type: n.type,
      title: n.title,
      body: null,
      triggered_by: lastEventId ?? null,
    });
  }

  return { processedCount: pending.length, notifications };
}

async function handleCustomToolUse(
  project: ProjectRow,
  event: Extract<
    Awaited<ReturnType<typeof listSessionEvents>>[number],
    { type: "agent.custom_tool_use" }
  >,
  notifications: Array<{ type: string; title: string }>,
): Promise<void> {
  if (!TASK_BOARD_TOOL_NAMES.includes(event.name)) {
    // 未知のcustom tool。設計上は発生しない想定だが、Sessionを詰まらせないようエラーを返す。
    await respondCustomToolResult(
      project.ma_session_id,
      event.id,
      `unknown tool: ${event.name}`,
      true,
    );
    return;
  }

  const input = event.input as Record<string, unknown>;

  if (event.name === "create_task") {
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: project.id,
      parent_task_id: (input.parent_task_id as string | undefined) ?? null,
      title: String(input.title ?? "(無題のタスク)"),
      status: "pending",
      due_date: (input.due_date as string | undefined) ?? null,
      source: "auto",
      ma_event_id: event.id,
    });
    const dependsOn = Array.isArray(input.depends_on_task_ids)
      ? (input.depends_on_task_ids as string[])
      : [];
    for (const depId of dependsOn) {
      repo.insertTaskDependency(taskId, depId);
    }
    await respondCustomToolResult(project.ma_session_id, event.id, JSON.stringify({ task_id: taskId }));
    return;
  }

  if (event.name === "update_task_status") {
    const taskId = String(input.task_id ?? "");
    const status = String(input.status ?? "");
    const task = repo.getTask(taskId);
    if (!task) {
      await respondCustomToolResult(
        project.ma_session_id,
        event.id,
        `task not found: ${taskId}`,
        true,
      );
      return;
    }
    // result（実行結果の要約）が渡された場合のみtasks.resultへ反映する（UC-05）。
    const result =
      typeof input.result === "string" && input.result.trim().length > 0
        ? input.result.trim()
        : undefined;
    repo.updateTaskStatus(taskId, status, result);
    await respondCustomToolResult(project.ma_session_id, event.id, "ok");
    return;
  }

  if (event.name === "execute_external_action") {
    // 既に処理済み（再Sync等）なら重複作成しない。
    const existing = repo.getConfirmationByEventId(event.id);
    if (existing) return;

    const taskId = String(input.task_id ?? "");
    const task = repo.getTask(taskId);
    if (!task) {
      await respondCustomToolResult(
        project.ma_session_id,
        event.id,
        `task not found: ${taskId}`,
        true,
      );
      return;
    }

    const confirmationId = randomUUID();
    repo.insertConfirmation({
      id: confirmationId,
      task_id: taskId,
      reason: String(input.reason ?? "irreversible"),
      proposed_action: String(input.action_summary ?? ""),
      risk_detail: (input.risk_detail as string | undefined) ?? null,
      ma_tool_use_event_id: event.id,
      ma_tool_kind: "custom",
    });
    repo.updateTaskStatus(taskId, "waiting_confirmation");
    notifications.push({
      type: "confirmation",
      title: String(input.action_summary ?? "確認が必要な操作があります"),
    });
    // ここでは user.custom_tool_result を返さない — ユーザーが
    // POST /api/confirmations/:id/respond で承認するまでSessionはidleのまま待機する。
  }
}
