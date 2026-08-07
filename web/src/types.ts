export type ProjectState = "progress" | "waiting_confirmation" | "done" | "hold";
export type ProjectStatus = "active" | "blocked" | "completed" | "cancelled";
export type TaskStatus = "pending" | "in_progress" | "waiting_confirmation" | "blocked" | "done";

export interface ProjectSummary {
  id: string;
  goal: string;
  category: string | null;
  status: ProjectStatus;
  deadline: string | null;
  state: ProjectState;
  nextAction: string | null;
  updatedAt: string;
}

export interface Task {
  id: string;
  parentTaskId: string | null;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  dependsOn: string[];
}

export interface ProjectDetail {
  id: string;
  goal: string;
  category: string | null;
  status: ProjectStatus;
  deadline: string | null;
  state: ProjectState;
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
