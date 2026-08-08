import { randomUUID } from "node:crypto";
import { repo } from "./repo.js";

/**
 * TEST_MODE（.env）: Managed Agents（Anthropic API）へ一切接続せずに、Project作成〜
 * タスク完了までの一連の流れ（Task DB更新・通知・ダッシュボード表示）を確認するための
 * モード。ANTHROPIC_API_KEY未設定・`agents:setup`未実行でも動作する。
 *
 * 呼び出しのたびに process.env を読む（モジュール読み込み時に固定値化しない）。
 * サーバー起動中に.envを書き換えて再起動した場合にも確実に反映されるようにするため
 * （`npm run dev` は --include .env でtsx watchが再起動する。README参照）。
 */
export function isTestModeEnabled(): boolean {
  return process.env.TEST_MODE === "true";
}

/** TEST_MODEで作られたSessionのID（`ma_session_id`）を実Sessionと区別するための接頭辞。 */
const TEST_SESSION_PREFIX = "test-session-";

export function createTestSessionId(): string {
  return `${TEST_SESSION_PREFIX}${randomUUID()}`;
}

/**
 * ma_session_idがTEST_MODEで作られたものかどうか。TEST_MODEが後からfalseに戻された
 * 場合でも、既存のテスト用Projectへのメッセージ送信/割り込みが実APIを叩いて502に
 * ならないよう、フラグではなくSession ID自体をマーカーにする。
 */
export function isTestSessionId(sessionId: string): boolean {
  return sessionId.startsWith(TEST_SESSION_PREFIX);
}

const TEST_RESULT_TEXT = "Test Result";

/**
 * 実際のCoordinator Agentの代わりに、5秒後に自動でタスクを完了させる疑似実行。
 * 本物のSync層と同じ経路（repo.updateTaskStatus等）でTask DBを更新するため、
 * ダッシュボード・通知・Project詳細のUI/APIはTEST_MODEかどうかを意識せず動く。
 */
export function runTestModeSimulation(
  projectId: string,
  goal: string,
  delayMs = 5000,
): void {
  const taskId = randomUUID();
  repo.insertTask({
    id: taskId,
    project_id: projectId,
    parent_task_id: null,
    title: goal,
    status: "in_progress",
    due_date: null,
    source: "auto",
    ma_event_id: null,
  });

  setTimeout(() => {
    repo.updateTaskStatus(taskId, "done", TEST_RESULT_TEXT);
    repo.updateProjectStatus(projectId, "completed");
    repo.insertNotification({
      id: randomUUID(),
      project_id: projectId,
      type: "completion",
      title: "Projectが完了しました（TEST_MODE）",
      body: TEST_RESULT_TEXT,
      triggered_by: null,
    });
  }, delayMs).unref();
}
