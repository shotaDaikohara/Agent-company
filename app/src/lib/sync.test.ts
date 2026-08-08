import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { repo, type ProjectRow } from "./repo.js";

// sync.tsはmanaged-agents/session.ts経由でAnthropic SDKへ到達するため、
// 実SDK・実APIキーに触れないようモックする（unit testの境界をTask DBとの読み書きに絞る）。
vi.mock("../managed-agents/session.js", () => ({
  listSessionEvents: vi.fn(),
  respondCustomToolResult: vi.fn(async () => {}),
  respondToolConfirmation: vi.fn(async () => {}),
}));

const { listSessionEvents, respondCustomToolResult } = await import(
  "../managed-agents/session.js"
);
const { processSessionEvents } = await import("./sync.js");

function insertProject(): ProjectRow {
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
  return repo.getProject(id)!;
}

beforeEach(() => {
  vi.mocked(listSessionEvents).mockReset();
  vi.mocked(respondCustomToolResult).mockClear();
});

describe("processSessionEvents", () => {
  it("create_task イベントでタスクが作成され、task_idが応答される", async () => {
    const project = insertProject();
    vi.mocked(listSessionEvents).mockResolvedValue([
      {
        type: "agent.custom_tool_use",
        id: "evt-1",
        name: "create_task",
        input: { title: "旅行先を比較する" },
      },
    ] as never);

    await processSessionEvents(project);

    const tasks = repo.listTasks(project.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("旅行先を比較する");
    expect(respondCustomToolResult).toHaveBeenCalledWith(
      project.ma_session_id,
      "evt-1",
      expect.stringContaining(tasks[0].id),
    );
  });

  it("update_task_status に result があれば tasks.result に反映される（UC-05）", async () => {
    const project = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: project.id,
      parent_task_id: null,
      title: "候補地の比較",
      status: "in_progress",
      due_date: null,
      source: "auto",
      ma_event_id: "evt-created",
    });

    vi.mocked(listSessionEvents).mockResolvedValue([
      {
        type: "agent.custom_tool_use",
        id: "evt-2",
        name: "update_task_status",
        input: { task_id: taskId, status: "done", result: "3案を比較し北海道に決定" },
      },
    ] as never);

    await processSessionEvents(project);

    const task = repo.getTask(taskId);
    expect(task?.status).toBe("done");
    expect(task?.result).toBe("3案を比較し北海道に決定");
    expect(respondCustomToolResult).toHaveBeenCalledWith(project.ma_session_id, "evt-2", "ok");
  });

  it("update_task_status に result が無ければ既存resultを保持する", async () => {
    const project = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: project.id,
      parent_task_id: null,
      title: "候補地の比較",
      status: "done",
      due_date: null,
      source: "auto",
      ma_event_id: "evt-created",
    });
    repo.updateTaskStatus(taskId, "done", "既存の結果");

    vi.mocked(listSessionEvents).mockResolvedValue([
      {
        type: "agent.custom_tool_use",
        id: "evt-3",
        name: "update_task_status",
        input: { task_id: taskId, status: "blocked" },
      },
    ] as never);

    await processSessionEvents(project);

    expect(repo.getTask(taskId)?.result).toBe("既存の結果");
  });

  it("execute_external_action は確認待ちを作りSession応答を返さない（NG-A対策）", async () => {
    const project = insertProject();
    const taskId = randomUUID();
    repo.insertTask({
      id: taskId,
      project_id: project.id,
      parent_task_id: null,
      title: "ホテルを予約する",
      status: "in_progress",
      due_date: null,
      source: "auto",
      ma_event_id: "evt-created",
    });

    vi.mocked(listSessionEvents).mockResolvedValue([
      {
        type: "agent.custom_tool_use",
        id: "evt-4",
        name: "execute_external_action",
        input: { task_id: taskId, reason: "irreversible", action_summary: "ホテルAを予約する" },
      },
    ] as never);

    const { notifications } = await processSessionEvents(project);

    expect(repo.getTask(taskId)?.status).toBe("waiting_confirmation");
    const confirmation = repo.getConfirmationByEventId("evt-4");
    expect(confirmation?.status).toBe("pending");
    expect(notifications).toEqual([{ type: "confirmation", title: "ホテルAを予約する" }]);
    // 承認が下りるまでSessionを待たせる設計のため、この呼び出しに対する応答は送らない。
    expect(respondCustomToolResult).not.toHaveBeenCalledWith(
      project.ma_session_id,
      "evt-4",
      expect.anything(),
    );
  });

  it("span.outcome_evaluation_end が satisfied ならProjectをcompletedにする", async () => {
    const project = insertProject();
    vi.mocked(listSessionEvents).mockResolvedValue([
      { type: "span.outcome_evaluation_end", id: "evt-5", result: "satisfied" },
    ] as never);

    const { notifications } = await processSessionEvents(project);

    expect(repo.getProject(project.id)?.status).toBe("completed");
    expect(notifications).toEqual([{ type: "completion", title: "Projectが完了しました" }]);
  });

  it("last_synced_event_idより後のイベントだけを処理する（冪等性）", async () => {
    const project = insertProject();
    vi.mocked(listSessionEvents).mockResolvedValue([
      { type: "agent.custom_tool_use", id: "evt-a", name: "create_task", input: { title: "タスク1" } },
      { type: "agent.custom_tool_use", id: "evt-b", name: "create_task", input: { title: "タスク2" } },
    ] as never);

    await processSessionEvents(project);
    expect(repo.listTasks(project.id)).toHaveLength(2);

    // 実運用ではWebhook再送やSyncの再実行が起こるため、events.list は同じ全件を
    // 返し続ける想定。カーソル（last_synced_event_id）が更新済みのprojectを渡すと
    // 未処理分（0件）だけが処理され、タスクが増えないことを確認する。
    const refetched = repo.getProject(project.id)!;
    const result = await processSessionEvents(refetched);

    expect(result.processedCount).toBe(0);
    expect(repo.listTasks(project.id)).toHaveLength(2);
  });
});
