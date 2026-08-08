import type { JobDetail, Subtask } from "../domain/types.js";

export function currentJobContext(detail: JobDetail) {
  const currentSubtasks = detail.subtasks.filter((st) => st.planVersion === detail.job.planVersion);
  const reusedSubtasks = detail.subtasks.filter(
    (st) => st.status === "DONE" && st.reusedInPlanVersion === detail.job.planVersion,
  );
  return {
    job: detail.job,
    currentSubtasks,
    reusedSubtasks,
    recentEvents: detail.events.slice(-20),
  };
}

export function summarizeSubtask(subtask: Subtask) {
  return {
    id: subtask.id,
    type: subtask.type,
    instruction: subtask.instruction,
    status: subtask.status,
    output: subtask.output,
    planVersion: subtask.planVersion,
  };
}
