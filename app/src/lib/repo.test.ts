import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { deriveProjectState, repo, type TaskRow } from "./repo.js";

function makeTaskRow(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: randomUUID(),
    project_id: "p1",
    parent_task_id: null,
    title: "タスク",
    status: "pending",
    due_date: null,
    source: "auto",
    ma_event_id: null,
    result: null,
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

function insertProject(): string {
  const id = randomUUID();
  repo.insertProject({
    id,
    user_id: "demo-user",
    goal: "テストの依頼",
    category: null,
    status: "active",
    deadline: null,
    ma_agent_id: "agent-test",
    ma_session_id: randomUUID(),
    outcome_id: null,
  });
  return id;
}

describe("deriveProjectState", () => {
  it("タスクが0件なら hold", () => {
    expect(deriveProjectState([])).toBe("hold");
  });

  it("waiting_confirmationのタスクが1つでもあれば最優先で waiting_confirmation", () => {
    const tasks = [
      makeTaskRow({ status: "done" }),
      makeTaskRow({ status: "waiting_confirmation" }),
      makeTaskRow({ status: "in_progress" }),
    ];
    expect(deriveProjectState(tasks)).toBe("waiting_confirmation");
  });

  it("waiting_confirmationがなくin_progressがあれば progress", () => {
    const tasks = [makeTaskRow({ status: "done" }), makeTaskRow({ status: "in_progress" })];
    expect(deriveProjectState(tasks)).toBe("progress");
  });

  it("全タスクがdoneなら done", () => {
    const tasks = [makeTaskRow({ status: "done" }), makeTaskRow({ status: "done" })];
    expect(deriveProjectState(tasks)).toBe("done");
  });

  it("pendingのみが残っている等、上記に該当しなければ hold", () => {
    const tasks = [makeTaskRow({ status: "pending" }), makeTaskRow({ status: "blocked" })];
    expect(deriveProjectState(tasks)).toBe("hold");
  });
});

describe("repo.updateTaskStatus（UC-05: 実行結果の記録）", () => {
  it("resultを渡すとstatusとresultが両方更新される", () => {
    const projectId = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: projectId,
      parent_task_id: null,
      title: "新幹線を比較する",
      status: "in_progress",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    repo.updateTaskStatus(taskId, "done", "3案を比較し、のぞみ号が最速と判明");

    const task = repo.getTask(taskId);
    expect(task?.status).toBe("done");
    expect(task?.result).toBe("3案を比較し、のぞみ号が最速と判明");
  });

  it("resultを渡さない場合は既存のresultを消さない", () => {
    const projectId = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: projectId,
      parent_task_id: null,
      title: "下調べ",
      status: "in_progress",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    repo.updateTaskStatus(taskId, "done", "調査完了");
    repo.updateTaskStatus(taskId, "blocked"); // resultを渡さない差し戻し

    const task = repo.getTask(taskId);
    expect(task?.status).toBe("blocked");
    expect(task?.result).toBe("調査完了");
  });

  it("新規タスクのresultはデフォルトでnull", () => {
    const projectId = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: projectId,
      parent_task_id: null,
      title: "着手前タスク",
      status: "pending",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    expect(repo.getTask(taskId)?.result).toBeNull();
  });
});

describe("repo.getLatestExternalActionLogForTask（UC-11: 実行証跡の取得）", () => {
  it("証跡が無いタスクはundefinedを返す", () => {
    const projectId = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: projectId,
      parent_task_id: null,
      title: "確認待ちタスク",
      status: "waiting_confirmation",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    expect(repo.getLatestExternalActionLogForTask(taskId)).toBeUndefined();
  });

  it("承認済み確認に紐づく実行証跡を返す", () => {
    const projectId = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: projectId,
      parent_task_id: null,
      title: "ホテルを予約する",
      status: "waiting_confirmation",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    const confirmationId = randomUUID();
    repo.insertConfirmation({
      id: confirmationId,
      task_id: taskId,
      reason: "irreversible",
      proposed_action: "ホテルAを1泊予約する",
      risk_detail: null,
      ma_tool_use_event_id: randomUUID(),
      ma_tool_kind: "custom",
    });
    repo.insertExternalActionLog({
      id: randomUUID(),
      confirmation_request_id: confirmationId,
      executed_at: new Date().toISOString(),
      result: "success",
      evidence: "模擬実行（外部連携はPhase 2以降で実装）",
    });

    const log = repo.getLatestExternalActionLogForTask(taskId);
    expect(log?.result).toBe("success");
    expect(log?.evidence).toContain("模擬実行");
  });

  it("他タスクの証跡を誤って返さない", () => {
    const projectId = insertProject();
    const taskA = randomUUID();
    const taskB = randomUUID();
    repo.insertTask({
      id: taskA,
      project_id: projectId,
      parent_task_id: null,
      title: "タスクA",
      status: "waiting_confirmation",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });
    repo.insertTask({
      id: taskB,
      project_id: projectId,
      parent_task_id: null,
      title: "タスクB",
      status: "pending",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });

    const confirmationId = randomUUID();
    repo.insertConfirmation({
      id: confirmationId,
      task_id: taskA,
      reason: "irreversible",
      proposed_action: "タスクAの操作",
      risk_detail: null,
      ma_tool_use_event_id: randomUUID(),
      ma_tool_kind: "custom",
    });
    repo.insertExternalActionLog({
      id: randomUUID(),
      confirmation_request_id: confirmationId,
      executed_at: new Date().toISOString(),
      result: "success",
      evidence: "タスクAの証跡",
    });

    expect(repo.getLatestExternalActionLogForTask(taskB)).toBeUndefined();
    expect(repo.getLatestExternalActionLogForTask(taskA)?.evidence).toBe("タスクAの証跡");
  });
});
