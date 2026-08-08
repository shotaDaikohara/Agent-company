import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repo } from "../../lib/repo.js";

vi.mock("../../managed-agents/session.js", () => ({
  createProjectSession: vi.fn(),
  sendUserMessage: vi.fn(async () => {}),
  interruptSession: vi.fn(async () => {}),
}));
vi.mock("../../managed-agents/memory.js", () => ({
  getOrCreateUserMemoryStore: vi.fn(async () => "memstore-test"),
}));
vi.mock("../../managed-agents/config.js", () => ({
  loadManagedAgentsConfig: vi.fn(() => ({
    environmentId: "env-test",
    agentId: "agent-test",
    agentVersion: 1,
    createdAt: new Date().toISOString(),
  })),
}));
// TEST_MODEの判定だけモックし、isTestSessionId/runTestModeSimulation等は実体のまま使う
// （DBへ実際に反映されることまで検証したいため）。
vi.mock("../../lib/testMode.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../lib/testMode.js")>();
  return { ...actual, isTestModeEnabled: vi.fn(() => false) };
});

const { createProjectSession } = await import("../../managed-agents/session.js");
const { isTestModeEnabled } = await import("../../lib/testMode.js");
const projectsRouter = (await import("./projects.js")).default;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/projects", projectsRouter);
  return app;
}

beforeEach(() => {
  vi.mocked(createProjectSession).mockReset();
  vi.mocked(isTestModeEnabled).mockReturnValue(false);
});

describe("GET /api/projects/:id（UC-05/UC-11: 実行結果・実行証跡の公開）", () => {
  it("タスクのresultとexecutionLogを含めて返す", async () => {
    const projectId = randomUUID();
    repo.insertProject({
      id: projectId,
      user_id: "demo-user",
      goal: "旅行の計画",
      category: null,
      status: "active",
      deadline: null,
      ma_agent_id: "agent-test",
      ma_session_id: randomUUID(),
      outcome_id: null,
    });

    const doneTaskId = randomUUID();
    repo.insertTask({
      id: doneTaskId,
      project_id: projectId,
      parent_task_id: null,
      title: "宿を比較する",
      status: "done",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });
    repo.updateTaskStatus(doneTaskId, "done", "3件比較し宿Aに決定");

    const bookedTaskId = randomUUID();
    repo.insertTask({
      id: bookedTaskId,
      project_id: projectId,
      parent_task_id: null,
      title: "宿を予約する",
      status: "done",
      due_date: null,
      source: "auto",
      ma_event_id: null,
    });
    const confirmationId = randomUUID();
    repo.insertConfirmation({
      id: confirmationId,
      task_id: bookedTaskId,
      reason: "irreversible",
      proposed_action: "宿Aを1泊予約する",
      risk_detail: null,
      ma_tool_use_event_id: randomUUID(),
      ma_tool_kind: "custom",
    });
    repo.insertExternalActionLog({
      id: randomUUID(),
      confirmation_request_id: confirmationId,
      executed_at: "2026-08-07T10:00:00.000Z",
      result: "success",
      evidence: "模擬実行（外部連携はPhase 2以降で実装）",
    });

    const res = await request(buildApp()).get(`/api/projects/${projectId}`);

    expect(res.status).toBe(200);
    const tasks: Array<Record<string, unknown>> = res.body.tasks;
    const doneTask = tasks.find((t) => t.id === doneTaskId);
    const bookedTask = tasks.find((t) => t.id === bookedTaskId);

    expect(doneTask?.result).toBe("3件比較し宿Aに決定");
    expect(doneTask?.executionLog).toBeNull();

    expect(bookedTask?.executionLog).toMatchObject({
      result: "success",
      evidence: "模擬実行（外部連携はPhase 2以降で実装）",
    });
  });

  it("存在しないProjectは404", async () => {
    const res = await request(buildApp()).get(`/api/projects/${randomUUID()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });
});

describe("POST /api/projects（NG-A: 偽の成功を返さない）", () => {
  it("Session作成に失敗した場合、Projectを作らず502を返す", async () => {
    vi.mocked(createProjectSession).mockRejectedValue(new Error("ANTHROPIC_API_KEY未設定"));

    const before = repo.listProjects("demo-user", ["active", "blocked", "completed"]).length;
    const res = await request(buildApp())
      .post("/api/projects")
      .send({ goal: "テスト依頼" });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("managed_agents_unavailable");
    expect(repo.listProjects("demo-user", ["active", "blocked", "completed"])).toHaveLength(before);
  });

  it("Session作成に成功した場合、201でProjectを作成する", async () => {
    vi.mocked(createProjectSession).mockResolvedValue({ sessionId: "sess-123" });

    const res = await request(buildApp())
      .post("/api/projects")
      .send({ goal: "10月の連休に旅行へ行きたい" });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("active");
    expect(repo.getProject(res.body.id)?.goal).toBe("10月の連休に旅行へ行きたい");
  });
});

describe("POST /api/projects（TEST_MODE: LLM APIを使わず5秒でTest Resultを返す）", () => {
  beforeEach(() => {
    vi.mocked(isTestModeEnabled).mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Managed Agentsへ接続せずにProjectを作成し、5秒後にresultが'Test Result'になる", async () => {
    const res = await request(buildApp())
      .post("/api/projects")
      .send({ goal: "TEST_MODEの依頼" });

    expect(res.status).toBe(201);
    expect(createProjectSession).not.toHaveBeenCalled();

    const detailBefore = await request(buildApp()).get(`/api/projects/${res.body.id}`);
    expect(detailBefore.body.tasks).toHaveLength(1);
    expect(detailBefore.body.tasks[0].status).toBe("in_progress");
    expect(detailBefore.body.tasks[0].result).toBeNull();

    await vi.advanceTimersByTimeAsync(5000);

    const detailAfter = await request(buildApp()).get(`/api/projects/${res.body.id}`);
    expect(detailAfter.body.tasks[0].status).toBe("done");
    expect(detailAfter.body.tasks[0].result).toBe("Test Result");
    expect(detailAfter.body.status).toBe("completed");
  });

  it("TEST_MODEで作られたProjectへのメッセージ送信・割り込みは実Sessionを呼ばない", async () => {
    const createRes = await request(buildApp())
      .post("/api/projects")
      .send({ goal: "TEST_MODEの依頼2" });

    const { sendUserMessage, interruptSession } = await import("../../managed-agents/session.js");

    const msgRes = await request(buildApp())
      .post(`/api/projects/${createRes.body.id}/messages`)
      .send({ text: "追加の指示" });
    expect(msgRes.status).toBe(202);
    expect(msgRes.body.testMode).toBe(true);
    expect(sendUserMessage).not.toHaveBeenCalled();

    const interruptRes = await request(buildApp()).post(
      `/api/projects/${createRes.body.id}/interrupt`,
    );
    expect(interruptRes.status).toBe(202);
    expect(interruptRes.body.testMode).toBe(true);
    expect(interruptSession).not.toHaveBeenCalled();
  });
});
