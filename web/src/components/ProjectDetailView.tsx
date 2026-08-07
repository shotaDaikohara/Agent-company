import { useEffect, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api";
import type { ProjectDetail } from "../types";
import { ProgressGauge } from "./ProgressGauge";

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

          <div className="quest-bar">
            <span className="quest-bar-label">進捗</span>
            <ProgressGauge counts={project.taskCounts} size="lg" />
            <span className="quest-bar-pct">
              {project.taskCounts.total > 0
                ? `${Math.round((project.taskCounts.done / project.taskCounts.total) * 100)}%`
                : "—"}
            </span>
          </div>

          <p className="section-label">Tasks（{project.tasks.length}）</p>
          {project.tasks.length === 0 ? (
            <div className="empty-state">
              まだタスクがありません。Coordinator Agentがcreate_taskを呼ぶと表示されます。
            </div>
          ) : (
            <div className="task-list">
              {project.tasks.map((t) => (
                <div className="task-item" key={t.id}>
                  <div className={`task-row${t.status === "done" ? " task-row-done" : ""}`}>
                    <span className={`pill pill-${t.status === "in_progress" ? "progress" : t.status}`}>
                      {t.status === "done" ? "✓" : TASK_STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    <span className="task-title">{t.title}</span>
                    {t.dueDate && <span className="task-due">期限 {t.dueDate}</span>}
                  </div>
                  {t.result && (
                    <p className="task-result">
                      <span className="task-result-label">結果</span>
                      {t.result}
                    </p>
                  )}
                  {t.executionLog && (
                    <p className={`task-result task-result-${t.executionLog.result}`}>
                      <span className="task-result-label">
                        実行証跡{t.executionLog.result === "failure" ? "（失敗）" : ""}
                      </span>
                      {t.executionLog.evidence ?? "証跡は記録されていません"}
                      <span className="task-result-time">
                        {" "}
                        （{new Date(t.executionLog.executedAt).toLocaleString("ja-JP")}）
                      </span>
                    </p>
                  )}
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
