import { useEffect, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api";
import type { ProjectSummary, ProjectState } from "../types";
import { StatusSprite, STATE_LABEL } from "./StatusSprite";

const STATE_ORDER: ProjectState[] = ["progress", "waiting_confirmation", "done", "hold"];

export function Dashboard({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { projects } = await api.listProjects();
      setProjects(projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projectの取得に失敗しました");
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000); // R-3: 状態を能動的に見れば分かる状態を維持
    return () => clearInterval(timer);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!goal.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createProject(goal.trim());
      setGoal("");
      await refresh();
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(`${err.message}（code: ${err.code}）`);
      } else {
        setError("依頼の送信に失敗しました");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const counts = STATE_ORDER.reduce<Record<ProjectState, number>>(
    (acc, s) => {
      acc[s] = projects?.filter((p) => p.state === s).length ?? 0;
      return acc;
    },
    { progress: 0, waiting_confirmation: 0, done: 0, hold: 0 },
  );

  return (
    <>
      <form className="goal-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="例: 10月の連休に家族旅行へ行きたい。計画しておいて。"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "送信中..." : "依頼する"}
        </button>
      </form>

      {error && <div className="banner-error">{error}</div>}

      <div className="summary">
        {STATE_ORDER.map((s) => (
          <div className="summary-item" key={s}>
            <span className={`summary-dot dot-${s}`} />
            <span className="summary-num">{counts[s]}</span>
            <span className="summary-label">{STATE_LABEL[s]}</span>
          </div>
        ))}
      </div>

      <p className="section-label">Projects</p>

      {projects === null ? (
        <div className="loading">読み込み中...</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          まだProjectがありません。上の欄に依頼を入力してください。
        </div>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <button
              key={p.id}
              className={`card state-${p.state}`}
              onClick={() => onOpenProject(p.id)}
              type="button"
            >
              <div className="card-sprite">
                <StatusSprite state={p.state} />
              </div>
              <div className="card-body">
                <div className="card-top">
                  <span className="pill" style={{ color: "var(--ink-faint)" }}>
                    {p.category ?? "—"}
                  </span>
                  <span className={`pill pill-${p.state}`}>{STATE_LABEL[p.state]}</span>
                </div>
                <h3 className="card-title">{p.goal}</h3>
                {p.nextAction && <p className="card-detail">次の処理: {p.nextAction}</p>}
                {p.deadline && <p className="card-detail">期限: {p.deadline}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
