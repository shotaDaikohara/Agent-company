import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailView } from "./ProjectDetailView";
import type { ProjectDetail } from "../types";

vi.mock("../api", () => ({
  api: {
    getProject: vi.fn(),
    sendMessage: vi.fn(),
    interruptProject: vi.fn(),
  },
  ApiRequestError: class ApiRequestError extends Error {},
}));

const { api } = await import("../api");

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "proj-1",
    goal: "10月の連休に家族旅行へ行きたい",
    category: "旅行",
    status: "active",
    deadline: null,
    state: "progress",
    taskCounts: { done: 1, total: 2 },
    tasks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(api.getProject).mockReset();
});

describe("ProjectDetailView（UC-05/UC-11: 実行結果・実行証跡の表示）", () => {
  it("完了タスクのresultを表示する（今回の起点となったギャップ）", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      makeProject({
        tasks: [
          {
            id: "task-1",
            parentTaskId: null,
            title: "宿泊先を比較する",
            status: "done",
            dueDate: null,
            dependsOn: [],
            result: "3件比較し、駅近のホテルAが最安と判明",
            executionLog: null,
          },
        ],
      }),
    );

    render(<ProjectDetailView projectId="proj-1" onBack={() => {}} />);

    await waitFor(() =>
      expect(screen.getByText("3件比較し、駅近のホテルAが最安と判明")).toBeInTheDocument(),
    );
    expect(screen.getByText("結果")).toBeInTheDocument();
  });

  it("承認済み外部操作の実行証跡（模擬実行の旨を含む）を表示する", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      makeProject({
        tasks: [
          {
            id: "task-2",
            parentTaskId: null,
            title: "ホテルを予約する",
            status: "done",
            dueDate: null,
            dependsOn: [],
            result: null,
            executionLog: {
              executedAt: "2026-08-07T10:00:00.000Z",
              result: "success",
              evidence: "模擬実行（外部連携はPhase 2以降で実装）",
            },
          },
        ],
      }),
    );

    render(<ProjectDetailView projectId="proj-1" onBack={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByText(/模擬実行（外部連携はPhase 2以降で実装）/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("実行証跡")).toBeInTheDocument();
  });

  it("失敗した実行証跡には「失敗」ラベルを付ける", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      makeProject({
        tasks: [
          {
            id: "task-3",
            parentTaskId: null,
            title: "航空券を予約する",
            status: "done",
            dueDate: null,
            dependsOn: [],
            result: null,
            executionLog: {
              executedAt: "2026-08-07T10:00:00.000Z",
              result: "failure",
              evidence: "決済に失敗",
            },
          },
        ],
      }),
    );

    render(<ProjectDetailView projectId="proj-1" onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText(/実行証跡（失敗）/)).toBeInTheDocument());
  });

  it("resultもexecutionLogも無いタスクには注記を表示しない", async () => {
    vi.mocked(api.getProject).mockResolvedValue(
      makeProject({
        tasks: [
          {
            id: "task-4",
            parentTaskId: null,
            title: "着手前のタスク",
            status: "pending",
            dueDate: null,
            dependsOn: [],
            result: null,
            executionLog: null,
          },
        ],
      }),
    );

    render(<ProjectDetailView projectId="proj-1" onBack={() => {}} />);

    await waitFor(() => expect(screen.getByText("着手前のタスク")).toBeInTheDocument());
    expect(screen.queryByText("結果")).not.toBeInTheDocument();
    expect(screen.queryByText("実行証跡")).not.toBeInTheDocument();
  });
});
