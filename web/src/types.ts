export type ProjectState = "progress" | "waiting_confirmation" | "done" | "hold";
export type ProjectStatus = "active" | "blocked" | "completed" | "cancelled";
export type TaskStatus = "pending" | "in_progress" | "waiting_confirmation" | "blocked" | "done";

export interface TaskCounts {
  done: number;
  total: number;
}

export interface ProjectSummary {
  id: string;
  goal: string;
  category: string | null;
  status: ProjectStatus;
  deadline: string | null;
  state: ProjectState;
  nextAction: string | null;
  updatedAt: string;
  taskCounts: TaskCounts;
}

export interface TaskExecutionLog {
  executedAt: string;
  result: "success" | "failure";
  evidence: string | null;
}

export interface Task {
  id: string;
  parentTaskId: string | null;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  dependsOn: string[];
  /** Coordinator Agentが記録した実行結果の要約（update_task_statusのresult引数）。UC-05 */
  result: string | null;
  /** 承認済み外部操作の実行証跡。模擬実行の場合はevidenceにその旨が明記される。UC-11 */
  executionLog: TaskExecutionLog | null;
}

export interface ProjectDetail {
  id: string;
  goal: string;
  category: string | null;
  status: ProjectStatus;
  deadline: string | null;
  state: ProjectState;
  taskCounts: TaskCounts;
  tasks: Task[];
}

export interface Confirmation {
  id: string;
  task_id: string;
  reason: "irreversible" | "high_risk" | "value_judgment";
  proposed_action: string;
  risk_detail: string | null;
  status: "pending" | "approved" | "rejected";
  ma_tool_use_event_id: string;
  ma_tool_kind: "native" | "custom";
  created_at: string;
  resolved_at: string | null;
}

export interface Notification {
  id: string;
  project_id: string;
  type: "discovery" | "plan_change" | "problem" | "confirmation" | "completion";
  title: string;
  body: string | null;
  triggered_by: string | null;
  read_at: string | null;
  created_at: string;
}

export interface ApiError {
  error: { code: string; message: string };
}
