import type { TaskCounts } from "../types";

/**
 * カイロソフト風のHP/XPバー。タスクの完了数からProjectの進捗をゲーム画面のように可視化する。
 */
export function ProgressGauge({
  counts,
  size = "sm",
}: {
  counts: TaskCounts;
  size?: "sm" | "lg";
}) {
  const { done, total } = counts;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const complete = total > 0 && done === total;

  return (
    <div className={`gauge gauge-${size}${complete ? " gauge-complete" : ""}`}>
      <div className="gauge-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="gauge-label">{total > 0 ? `${done}/${total}` : "—"}</span>
    </div>
  );
}
