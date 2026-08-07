import deskPlain from "../assets/desk_plain.png";
import deskCoder from "../assets/desk_coder_char.png";
import charGirl from "../assets/char_girl.png";
import deskEmpty2 from "../assets/desk_empty2.png";
import emptyOfficeChar from "../assets/char_boy.png";
import type { ProjectState } from "../types";

const SPRITE_BY_STATE: Record<ProjectState, string> = {
  progress: deskCoder,
  waiting_confirmation: charGirl,
  done: deskPlain,
  hold: deskEmpty2,
};

const BADGE_GLYPH: Record<ProjectState, string> = {
  progress: "⚙",
  waiting_confirmation: "!",
  done: "✓",
  hold: "…",
};

export function StatusSprite({
  state,
  walking = false,
}: {
  state: ProjectState;
  /** true の間、キャラが入口から座席まで歩いてくる登場アニメーションを再生する */
  walking?: boolean;
}) {
  const isWorking = state === "progress";
  const isWaiting = state === "waiting_confirmation";

  const classes = ["sprite-stage"];
  if (isWorking) classes.push("is-working");
  if (isWaiting) classes.push("is-waiting");
  if (walking) classes.push("is-walking-in");

  return (
    <div className={classes.join(" ")}>
      <img className="sprite-img" src={SPRITE_BY_STATE[state]} alt="" />
      {isWorking && !walking && (
        <>
          {/* R-3: 作業中は視覚的に一目で分かるよう、タイピング演出を常時アニメーションで表現 */}
          <span className="fx-spark fx-spark-1">✦</span>
          <span className="fx-spark fx-spark-2">✧</span>
          <span className="fx-note">♪</span>
        </>
      )}
      {isWaiting && <span className="fx-bubble">?</span>}
    </div>
  );
}

export function StatusBadge({ state }: { state: ProjectState }) {
  return <span className={`state-badge badge-${state}`}>{BADGE_GLYPH[state]}</span>;
}

export const STATE_LABEL: Record<ProjectState, string> = {
  progress: "進行中",
  waiting_confirmation: "確認待ち",
  done: "完了",
  hold: "未着手",
};

export const EMPTY_OFFICE_CHAR = emptyOfficeChar;
