import deskPlain from "../assets/desk_plain.png";
import deskCoder from "../assets/desk_coder_char.png";
import charGirl from "../assets/char_girl.png";
import deskEmpty2 from "../assets/desk_empty2.png";
import type { ProjectState } from "../types";

const SPRITE_BY_STATE: Record<ProjectState, string> = {
  progress: deskCoder,
  waiting_confirmation: charGirl,
  done: deskPlain,
  hold: deskEmpty2,
};

export function StatusSprite({ state }: { state: ProjectState }) {
  return <img src={SPRITE_BY_STATE[state]} alt="" />;
}

export const STATE_LABEL: Record<ProjectState, string> = {
  progress: "進行中",
  waiting_confirmation: "確認待ち",
  done: "完了",
  hold: "未着手",
};
