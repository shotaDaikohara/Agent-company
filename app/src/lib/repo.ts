import { db } from "../db/index.js";

export interface ProjectRow {
  id: string;
  user_id: string;
  goal: string;
  category: string | null;
  status: string;
  deadline: string | null;
  ma_agent_id: string;
  ma_session_id: string;
  outcome_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  project_id: string;
  parent_task_id: string | null;
  title: string;
  status: string;
  due_date: string | null;
  source: string;
  ma_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfirmationRow {
  id: string;
  task_id: string;
  reason: string;
  proposed_action: string;
  risk_detail: string | null;
  status: string;
  ma_tool_use_event_id: string;
  created_at: string;
  resolved_at: string | null;
}

/** Task木から集約状態を導く（ダッシュボードの状態バッジ用）。 */
export function deriveProjectState(
  tasks: TaskRow[],
): "progress" | "waiting_confirmation" | "done" | "hold" {
  if (tasks.length === 0) return "hold";
  if (tasks.some((t) => t.status === "waiting_confirmation")) return "waiting_confirmation";
  if (tasks.some((t) => t.status === "in_progress")) return "progress";
  if (tasks.every((t) => t.status === "done")) return "done";
  return "hold";
}

export const repo = {
  listProjects(userId: string, statuses: string[]): ProjectRow[] {
    const placeholders = statuses.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT * FROM projects WHERE user_id = ? AND status IN (${placeholders}) ORDER BY updated_at DESC`,
      )
      .all(userId, ...statuses) as ProjectRow[];
  },

  getProject(id: string): ProjectRow | undefined {
    return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
      | ProjectRow
      | undefined;
  },

  getProjectBySessionId(sessionId: string): ProjectRow | undefined {
    return db
      .prepare(`SELECT * FROM projects WHERE ma_session_id = ?`)
      .get(sessionId) as ProjectRow | undefined;
  },

  insertProject(row: Omit<ProjectRow, "created_at" | "updated_at">): void {
    db.prepare(
      `INSERT INTO projects (id, user_id, goal, category, status, deadline, ma_agent_id, ma_session_id, outcome_id)
       VALUES (@id, @user_id, @goal, @category, @status, @deadline, @ma_agent_id, @ma_session_id, @outcome_id)`,
    ).run(row);
  },

  updateProjectStatus(id: string, status: string): void {
    db.prepare(
      `UPDATE projects SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(status, id);
  },

  listTasks(projectId: string): TaskRow[] {
    return db
      .prepare(`SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC`)
      .all(projectId) as TaskRow[];
  },

  getTask(id: string): TaskRow | undefined {
    return db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined;
  },

  listDependencies(taskIds: string[]): Array<{ task_id: string; depends_on_task_id: string }> {
    if (taskIds.length === 0) return [];
    const placeholders = taskIds.map(() => "?").join(",");
    return db
      .prepare(
        `SELECT task_id, depends_on_task_id FROM task_dependencies WHERE task_id IN (${placeholders})`,
      )
      .all(...taskIds) as Array<{ task_id: string; depends_on_task_id: string }>;
  },

  insertTask(row: Omit<TaskRow, "created_at" | "updated_at">): void {
    db.prepare(
      `INSERT INTO tasks (id, project_id, parent_task_id, title, status, due_date, source, ma_event_id)
       VALUES (@id, @project_id, @parent_task_id, @title, @status, @due_date, @source, @ma_event_id)`,
    ).run(row);
  },

  listConfirmations(status?: string): ConfirmationRow[] {
    if (status) {
      return db
        .prepare(`SELECT * FROM confirmation_requests WHERE status = ? ORDER BY created_at DESC`)
        .all(status) as ConfirmationRow[];
    }
    return db
      .prepare(`SELECT * FROM confirmation_requests ORDER BY created_at DESC`)
      .all() as ConfirmationRow[];
  },

  getConfirmation(id: string): ConfirmationRow | undefined {
    return db.prepare(`SELECT * FROM confirmation_requests WHERE id = ?`).get(id) as
      | ConfirmationRow
      | undefined;
  },

  resolveConfirmation(id: string, status: "approved" | "rejected"): void {
    db.prepare(
      `UPDATE confirmation_requests SET status = ?, resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(status, id);
  },

  insertNotification(row: {
    id: string;
    project_id: string;
    type: string;
    title: string;
    body: string | null;
    triggered_by: string | null;
  }): void {
    db.prepare(
      `INSERT INTO notifications (id, project_id, type, title, body, triggered_by)
       VALUES (@id, @project_id, @type, @title, @body, @triggered_by)`,
    ).run(row);
  },

  listNotifications(unreadOnly: boolean) {
    if (unreadOnly) {
      return db
        .prepare(`SELECT * FROM notifications WHERE read_at IS NULL ORDER BY created_at DESC`)
        .all();
    }
    return db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC`).all();
  },

  markNotificationRead(id: string): void {
    db.prepare(
      `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(id);
  },
};
