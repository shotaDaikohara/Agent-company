import { useEffect, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api";
import type { ProjectSummary, ProjectState } from "../types";
import { StatusSprite, StatusBadge, STATE_LABEL, EMPTY_OFFICE_CHAR } from "./StatusSprite";
import { ConfirmationsPanel } from "./ConfirmationsPanel";

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

      <ConfirmationsPanel onResolved={refresh} />

      <div className="hud">
        {STATE_ORDER.map((s) => (
          <div className="hud-chip" key={s}>
            <span className={`hud-dot dot-${s}`} />
            <span className="hud-num">{counts[s]}</span>
            <span>{STATE_LABEL[s]}</span>
          </div>
        ))}
      </div>

      <p className="section-label">オフィスフロア — {projects?.length ?? 0}件のProject</p>

      <div className="office-floor">
        {projects === null ? (
          <div className="loading">読み込み中...</div>
        ) : projects.length === 0 ? (
          <div className="empty-office">
            <img src={EMPTY_OFFICE_CHAR} alt="" />
            <div className="empty-office-bubble">
              まだ誰も出社していません。上の欄に依頼を入力してください。
            </div>
          </div>
        ) : (
          <div className="desk-grid">
            {projects.map((p) => (
              <button
                key={p.id}
                className="desk-slot"
                onClick={() => onOpenProject(p.id)}
                type="button"
              >
                <div className="desk-sprite-wrap">
                  <StatusSprite state={p.state} />
                  <StatusBadge state={p.state} />
                </div>
                <div className="nameplate">
                  <span className="nameplate-cat">{p.category ?? "—"}</span>
                  <span className="nameplate-title">{p.goal}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
