import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repo, type ProjectRow } from "./repo.js";
import {
  createTestSessionId,
  isTestModeEnabled,
  isTestSessionId,
  runTestModeSimulation,
} from "./testMode.js";

function insertProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  const id = randomUUID();
  repo.insertProject({
    id,
    user_id: "demo-user",
    goal: "テストの依頼",
    category: null,
    status: "active",
    deadline: null,
    ma_agent_id: "test-agent",
    ma_session_id: createTestSessionId(),
    outcome_id: null,
    ...overrides,
  });
  return repo.getProject(id)!;
}

describe("isTestModeEnabled", () => {
  const original = process.env.TEST_MODE;
  afterEach(() => {
    if (original === undefined) delete process.env.TEST_MODE;
    else process.env.TEST_MODE = original;
  });

  it("TEST_MODE=true のときのみ true", () => {
    process.env.TEST_MODE = "true";
    expect(isTestModeEnabled()).toBe(true);
  });

  it("未設定・false・その他の値では false", () => {
    delete process.env.TEST_MODE;
    expect(isTestModeEnabled()).toBe(false);
    process.env.TEST_MODE = "false";
    expect(isTestModeEnabled()).toBe(false);
    process.env.TEST_MODE = "1";
    expect(isTestModeEnabled()).toBe(false);
  });
});

describe("isTestSessionId / createTestSessionId", () => {
  it("createTestSessionIdが生成したIDはisTestSessionIdでtrueと判定される", () => {
    expect(isTestSessionId(createTestSessionId())).toBe(true);
  });

  it("実Sessionの sess_xxx 形式はfalse", () => {
    expect(isTestSessionId("sess_01AbCdEfGh")).toBe(false);
  });
});

describe("runTestModeSimulation（LLM APIを使わず5秒後に完了する）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("開始直後はタスクがin_progressで、resultはまだ無い", () => {
    const project = insertProject();
    runTestModeSimulation(project.id, "旅行を計画する");

    const tasks = repo.listTasks(project.id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("旅行を計画する");
    expect(tasks[0].status).toBe("in_progress");
    expect(tasks[0].result).toBeNull();
    expect(repo.getProject(project.id)?.status).toBe("active");
  });

  it("5秒未満では完了しない", () => {
    const project = insertProject();
    runTestModeSimulation(project.id, "旅行を計画する");

    vi.advanceTimersByTime(4999);

    const [task] = repo.listTasks(project.id);
    expect(task.status).toBe("in_progress");
  });

  it("5秒後にタスクがdone・resultが'Test Result'になり、Projectもcompletedになる", () => {
    const project = insertProject();
    runTestModeSimulation(project.id, "旅行を計画する");

    vi.advanceTimersByTime(5000);

    const [task] = repo.listTasks(project.id);
    expect(task.status).toBe("done");
    expect(task.result).toBe("Test Result");
    expect(repo.getProject(project.id)?.status).toBe("completed");
  });

  it("完了時に通知が1件作成される", () => {
    const project = insertProject();
    runTestModeSimulation(project.id, "旅行を計画する");

    vi.advanceTimersByTime(5000);

    const notifications = repo.listNotifications(false) as Array<{
      project_id: string;
      type: string;
      body: string | null;
    }>;
    const own = notifications.filter((n) => n.project_id === project.id);
    expect(own).toHaveLength(1);
    expect(own[0].type).toBe("completion");
    expect(own[0].body).toBe("Test Result");
  });

  it("delayMsを指定した場合はその時間まで完了しない", () => {
    const project = insertProject();
    runTestModeSimulation(project.id, "短縮テスト", 100);

    vi.advanceTimersByTime(99);
    expect(repo.listTasks(project.id)[0].status).toBe("in_progress");

    vi.advanceTimersByTime(1);
    expect(repo.listTasks(project.id)[0].status).toBe("done");
  });
});
