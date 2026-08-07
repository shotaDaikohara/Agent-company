import { useEffect, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api";
import type { ProjectDetail } from "../types";

const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "未着手",
  in_progress: "進行中",
  waiting_confirmation: "確認待ち",
  blocked: "保留",
  done: "完了",
};

export function ProjectDetailView({
  projectId,
  onBack,
}: {
  projectId: string;
  onBack: () => void;
}) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const detail = await api.getProject(projectId);
      setProject(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projectの取得に失敗しました");
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendMessage(projectId, message.trim());
      setMessage("");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "送信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleInterrupt() {
    setBusy(true);
    setError(null);
    try {
      await api.interruptProject(projectId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "割り込みに失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="back-btn" onClick={onBack} type="button">
        ← ダッシュボードへ戻る
      </button>

      {error && <div className="banner-error">{error}</div>}

      {!project ? (
        <div className="loading">読み込み中...</div>
      ) : (
        <>
          <div className="detail-header">
            <div>
              <h2 className="detail-goal">{project.goal}</h2>
              <div className="detail-meta">
                {project.category ?? "—"} / {project.status}
                {project.deadline ? ` / 期限: ${project.deadline}` : ""}
              </div>
            </div>
            <button className="btn btn-danger" onClick={handleInterrupt} disabled={busy} type="button">
              方針変更・中断
            </button>
          </div>

          <p className="section-label">Tasks（{project.tasks.length}）</p>
          {project.tasks.length === 0 ? (
            <div className="empty-state">
              まだタスクがありません。Coordinator Agentがcreate_taskを呼ぶと表示されます。
            </div>
          ) : (
            <div className="task-list">
              {project.tasks.map((t) => (
                <div className="task-row" key={t.id}>
                  <span className={`pill pill-${t.status === "in_progress" ? "progress" : t.status}`}>
                    {TASK_STATUS_LABEL[t.status] ?? t.status}
                  </span>
                  <span className="task-title">{t.title}</span>
                  {t.dueDate && <span className="task-due">期限 {t.dueDate}</span>}
                </div>
              ))}
            </div>
          )}

          <form className="message-form" onSubmit={handleSend}>
            <input
              type="text"
              placeholder="追加の指示・回答を送る（例: 15万円まで）"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              送信
            </button>
          </form>
        </>
      )}
    </>
  );
}
