import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiRequestError } from "../api";
import type { ProjectSummary, ProjectState } from "../types";
import { StatusSprite, StatusBadge, STATE_LABEL, EMPTY_OFFICE_CHAR } from "./StatusSprite";
import { ConfirmationsPanel } from "./ConfirmationsPanel";
import { ProgressGauge } from "./ProgressGauge";

const STATE_ORDER: ProjectState[] = ["progress", "waiting_confirmation", "done", "hold"];

// 歩行アニメーションの再生時間（CSS側の @keyframes walk-in と合わせる）
const WALK_IN_MS = 900;

export function Dashboard({ onOpenProject }: { onOpenProject: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [goal, setGoal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 直前ポーリング時点でのstateを記録し、「hold/doneなど→progress」に切り替わった瞬間だけ検知する
  const prevStatesRef = useRef<Map<string, ProjectState>>(new Map());
  const isFirstLoadRef = useRef(true);
  const [walkingIds, setWalkingIds] = useState<Set<string>>(new Set());

  async function refresh() {
    try {
      const { projects: next } = await api.listProjects();
      const prevStates = prevStatesRef.current;

      if (!isFirstLoadRef.current) {
        const newlyStarted = next.filter(
          (p) => p.state === "progress" && prevStates.get(p.id) !== "progress",
        );
        if (newlyStarted.length > 0) {
          setWalkingIds((cur) => {
            const merged = new Set(cur);
            newlyStarted.forEach((p) => merged.add(p.id));
            return merged;
          });
          newlyStarted.forEach((p) => {
            setTimeout(() => {
              setWalkingIds((cur) => {
                const rest = new Set(cur);
                rest.delete(p.id);
                return rest;
              });
            }, WALK_IN_MS);
          });
        }
      }

      prevStatesRef.current = new Map(next.map((p) => [p.id, p.state]));
      isFirstLoadRef.current = false;
      setProjects(next);
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
        <div className="office-wall" aria-hidden="true">
          <span className="office-window" />
          <span className="office-door" />
          <span className="office-plant">🪴</span>
          <span className="office-window" />
        </div>

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
          <div className="seat-grid">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`seat${p.state === "progress" ? " seat-working" : ""}`}
                onClick={() => onOpenProject(p.id)}
                type="button"
                title={p.goal}
              >
                <div className="seat-desk">
                  <StatusSprite state={p.state} walking={walkingIds.has(p.id)} />
                  <StatusBadge state={p.state} />
                </div>
                <div className="seat-label">
                  <span className="seat-label-cat">{p.category ?? "—"}</span>
                  <span className="seat-label-title">{p.goal}</span>
                  <ProgressGauge counts={p.taskCounts} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
