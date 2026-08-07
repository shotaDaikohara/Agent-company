import type { Confirmation, Notification, ProjectDetail, ProjectSummary } from "./types";

const BASE = "/api";

export class ApiRequestError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let code = "unknown_error";
    let message = `リクエストに失敗しました (${res.status})`;
    try {
      const body = await res.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      // レスポンスボディがJSONでない場合はデフォルトメッセージのまま
    }
    throw new ApiRequestError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<{ projects: ProjectSummary[] }>("/projects"),
  createProject: (goal: string) =>
    request<{ id: string; status: string; maSessionId: string }>("/projects", {
      method: "POST",
      body: JSON.stringify({ goal }),
    }),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${id}`),
  sendMessage: (id: string, text: string) =>
    request<{ accepted: boolean }>(`/projects/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  interruptProject: (id: string) =>
    request<{ accepted: boolean }>(`/projects/${id}/interrupt`, { method: "POST" }),

  listConfirmations: (status?: string) =>
    request<{ confirmations: Confirmation[] }>(
      `/confirmations${status ? `?status=${status}` : ""}`,
    ),
  respondConfirmation: (id: string, result: "allow" | "deny", message?: string) =>
    request<Confirmation>(`/confirmations/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ result, message }),
    }),

  listNotifications: (unreadOnly = false) =>
    request<{ notifications: Notification[] }>(
      `/notifications${unreadOnly ? "?unread=true" : ""}`,
    ),
  markNotificationRead: (id: string) =>
    request<void>(`/notifications/${id}/read`, { method: "POST" }),
};
