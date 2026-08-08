export const JOB_PRIORITIES = ["HIGH", "NORMAL", "LOW"] as const;
export type JobPriority = (typeof JOB_PRIORITIES)[number];

export const JOB_STATUSES = [
  "IN_PROGRESS",
  "WAITING_USER",
  "COMPLETED",
  "FAILED",
  "CANCELED",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const SUBTASK_TYPES = ["RESEARCH", "CREATE", "REVIEW", "ACTION"] as const;
export type SubtaskType = (typeof SUBTASK_TYPES)[number];

export const SUBTASK_STATUSES = [
  "TODO",
  "IN_PROGRESS",
  "WAITING_USER",
  "DONE",
  "FAILED",
  "CANCELED",
] as const;
export type SubtaskStatus = (typeof SUBTASK_STATUSES)[number];

export const EVENT_TYPES = [
  "JOB_CREATED",
  "JOB_UPDATED",
  "PLAN_REPLACED",
  "SUBTASK_UPDATED",
  "PRIORITY_CHANGED",
  "CONFIRMATION_REQUIRED",
  "JOB_COMPLETED",
  "JOB_CANCELED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface CompletionEvidence {
  criterion: string;
  evidence: string;
}

export interface Job {
  id: string;
  title: string;
  request: string;
  goal: string;
  completionCriteria: string[];
  priority: JobPriority;
  status: JobStatus;
  planVersion: number;
  finalOutput: string | null;
  completionEvidence: CompletionEvidence[];
  createdAt: string;
  updatedAt: string;
}

export interface Subtask {
  id: string;
  jobId: string;
  type: SubtaskType;
  instruction: string;
  dependsOn: string[];
  status: SubtaskStatus;
  output: string | null;
  planVersion: number;
  sortOrder: number;
  reusedInPlanVersion: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  jobId: string;
  subtaskId: string | null;
  eventType: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface JobDetail {
  job: Job;
  subtasks: Subtask[];
  events: EventRecord[];
}

export interface DashboardJob {
  id: string;
  title: string;
  goal: string;
  priority: JobPriority;
  status: JobStatus;
  currentStep: string | null;
  waitingReason: string | null;
  completedCount: number;
  totalCount: number;
  updatedAt: string;
}
