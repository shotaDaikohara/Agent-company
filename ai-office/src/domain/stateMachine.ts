import type { JobStatus, SubtaskStatus } from "./types.js";

const JOB_TRANSITIONS: Record<JobStatus, ReadonlySet<JobStatus>> = {
  IN_PROGRESS: new Set(["IN_PROGRESS", "WAITING_USER", "COMPLETED", "FAILED", "CANCELED"]),
  WAITING_USER: new Set(["WAITING_USER", "IN_PROGRESS", "FAILED", "CANCELED"]),
  COMPLETED: new Set(["COMPLETED"]),
  FAILED: new Set(["FAILED"]),
  CANCELED: new Set(["CANCELED"]),
};

const SUBTASK_TRANSITIONS: Record<SubtaskStatus, ReadonlySet<SubtaskStatus>> = {
  TODO: new Set(["TODO", "IN_PROGRESS", "WAITING_USER", "CANCELED", "FAILED"]),
  IN_PROGRESS: new Set(["IN_PROGRESS", "WAITING_USER", "DONE", "FAILED", "CANCELED"]),
  WAITING_USER: new Set(["WAITING_USER", "IN_PROGRESS", "DONE", "FAILED", "CANCELED"]),
  DONE: new Set(["DONE"]),
  FAILED: new Set(["FAILED"]),
  CANCELED: new Set(["CANCELED"]),
};

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!JOB_TRANSITIONS[from].has(to)) {
    throw new Error(`Invalid Job status transition: ${from} -> ${to}`);
  }
}

export function assertSubtaskTransition(from: SubtaskStatus, to: SubtaskStatus): void {
  if (!SUBTASK_TRANSITIONS[from].has(to)) {
    throw new Error(`Invalid Subtask status transition: ${from} -> ${to}`);
  }
}
