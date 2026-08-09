import { randomUUID } from "node:crypto";
import { Repository, type CreateJobInput, type CreateSubtaskInput } from "../db/repository.js";
import { assertJobTransition, assertSubtaskTransition } from "../domain/stateMachine.js";
import type {
  CompletionEvidence,
  EventType,
  JobPriority,
  JobStatus,
  Subtask,
  SubtaskStatus,
} from "../domain/types.js";

type SubtaskUpdatePatch = {
  status?: SubtaskStatus;
  output?: string | null;
  waitingReason?: string;
  userInput?: string;
};

function now(): string {
  return new Date().toISOString();
}

export class AiOfficeService {
  constructor(readonly repo: Repository) {}

  createJob(input: CreateJobInput) { return this.repo.createJob(input); }
  listJobs(input: { status?: JobStatus; priority?: JobPriority } = {}) { return this.repo.listJobs(input); }
  getJob(jobId: string) { return this.repo.getJob(jobId); }

  getDashboard() {
    return this.repo.getDashboard().map((job) => {
      if (job.status !== "WAITING_USER") return job;
      const detail = this.repo.getJob(job.id);
      const waitingSubtask = detail.subtasks.find(
        (subtask) => subtask.planVersion === detail.job.planVersion && subtask.status === "WAITING_USER",
      );
      if (!waitingSubtask) return job;
      const confirmation = [...detail.events].reverse().find(
        (event) => event.subtaskId === waitingSubtask.id
          && event.eventType === "CONFIRMATION_REQUIRED"
          && typeof event.payload.question === "string",
      );
      return {
        ...job,
        waitingReason: typeof confirmation?.payload.question === "string"
          ? confirmation.payload.question
          : job.waitingReason,
      };
    });
  }

  updateJob(jobId: string, patch: { title?: string; goal?: string; completionCriteria?: string[]; status?: JobStatus; finalOutput?: string | null }) {
    const current = this.repo.getJob(jobId).job;
    if (patch.status) assertJobTransition(current.status, patch.status);
    return this.repo.updateJob(jobId, patch);
  }

  updateSubtask(id: string, patch: SubtaskUpdatePatch) {
    const current = this.repo.getSubtask(id);
    if (patch.status) assertSubtaskTransition(current.status, patch.status);
    if (patch.status === "CANCELED") {
      throw new Error("Do not cancel a current-plan subtask directly; use replace_plan so obsolete work moves to a new plan version");
    }

    const targetStatus = patch.status ?? current.status;
    const waitingReason = patch.waitingReason?.trim();
    const userInput = patch.userInput?.trim();
    const priorUserInputExists = this.hasRecordedUserInput(current.jobId, current.id);

    if (targetStatus === "WAITING_USER" && !waitingReason) {
      throw new Error("WAITING_USER requires waitingReason describing exactly what the user must answer or decide");
    }
    if (current.status === "WAITING_USER" && targetStatus !== "WAITING_USER" && !userInput && !priorUserInputExists) {
      throw new Error("Resolving WAITING_USER requires userInput copied from the user's explicit response");
    }

    if (patch.status === "IN_PROGRESS" || patch.status === "DONE") {
      this.assertDependenciesDoneForCurrentPlan(current);
    }

    const updated = this.repo.updateSubtask(id, { status: patch.status, output: patch.output });

    if (targetStatus === "WAITING_USER" && waitingReason) {
      this.enrichLatestConfirmationEvent(current.jobId, current.id, waitingReason);
    }
    if (userInput) {
      this.insertEvent(current.jobId, current.id, "USER_INPUT_RECEIVED", { input: userInput });
    }

    this.recalculateJobState(current.jobId);
    return updated;
  }

  replacePlan(jobId: string, input: { goal?: string; completionCriteria?: string[]; subtasks: CreateSubtaskInput[]; reuseSubtaskIds?: string[] }) {
    return this.repo.replacePlan(jobId, input);
  }

  changePriority(jobId: string, priority: JobPriority) { return this.repo.updatePriority(jobId, priority); }
  cancelJob(jobId: string) { return this.repo.cancelJob(jobId); }

  completeJob(jobId: string, finalOutput: string, completionEvidence: CompletionEvidence[]) {
    const detail = this.repo.getJob(jobId);
    const current = detail.subtasks.filter((subtask) => subtask.planVersion === detail.job.planVersion);
    const unfinished = current.filter((subtask) => subtask.status !== "DONE");
    if (unfinished.length) {
      throw new Error(`Cannot complete job: all current-plan subtasks must be DONE; ${unfinished.length} are not DONE`);
    }

    const criteria = new Set(detail.job.completionCriteria);
    if (completionEvidence.length !== criteria.size) {
      throw new Error("Cannot complete job: provide exactly one completion evidence item per criterion");
    }
    const seenCriteria = new Set<string>();
    const effectiveDone = new Map(
      detail.subtasks
        .filter((subtask) => subtask.status === "DONE" && this.isEffectiveForCurrentPlan(subtask, detail.job.planVersion))
        .map((subtask) => [subtask.id, subtask]),
    );

    for (const item of completionEvidence) {
      if (!criteria.has(item.criterion)) throw new Error(`Cannot complete job: unknown completion criterion: ${item.criterion}`);
      if (seenCriteria.has(item.criterion)) throw new Error(`Cannot complete job: duplicate completion evidence for: ${item.criterion}`);
      seenCriteria.add(item.criterion);
      if (!item.evidence.trim()) throw new Error(`Cannot complete job: empty evidence for: ${item.criterion}`);
      if (!item.sourceSubtaskIds.length) throw new Error(`Cannot complete job: evidence must cite at least one sourceSubtaskId for: ${item.criterion}`);

      for (const sourceId of item.sourceSubtaskIds) {
        const source = effectiveDone.get(sourceId);
        if (!source) {
          throw new Error(`Cannot complete job: evidence source is not an effective DONE subtask: ${sourceId}`);
        }
        if (!source.output?.trim()) {
          throw new Error(`Cannot complete job: evidence source has no stored output: ${sourceId}`);
        }
      }
    }

    const completed = this.repo.completeJob(jobId, finalOutput, completionEvidence);
    this.repo.db.prepare("UPDATE jobs SET completion_evidence_json=? WHERE id=?")
      .run(JSON.stringify(completionEvidence), jobId);
    return this.repo.getJob(completed.job.id);
  }

  private assertDependenciesDoneForCurrentPlan(subtask: Subtask): void {
    const detail = this.repo.getJob(subtask.jobId);
    for (const dependencyId of subtask.dependsOn) {
      const dependency = detail.subtasks.find((candidate) => candidate.id === dependencyId);
      if (!dependency) throw new Error(`Dependency not found: ${dependencyId}`);
      if (dependency.status !== "DONE" || !this.isEffectiveForCurrentPlan(dependency, detail.job.planVersion)) {
        throw new Error(`Subtask dependency is not complete for current plan: ${dependencyId}`);
      }
    }
  }

  private isEffectiveForCurrentPlan(subtask: Subtask, planVersion: number): boolean {
    return subtask.planVersion === planVersion || subtask.reusedInPlanVersion === planVersion;
  }

  private hasRecordedUserInput(jobId: string, subtaskId: string): boolean {
    return this.repo.getJob(jobId).events.some(
      (event) => event.subtaskId === subtaskId
        && event.eventType === "USER_INPUT_RECEIVED"
        && typeof event.payload.input === "string"
        && event.payload.input.trim().length > 0,
    );
  }

  private enrichLatestConfirmationEvent(jobId: string, subtaskId: string, question: string): void {
    const row = this.repo.db.prepare(`SELECT id FROM events
      WHERE job_id=? AND subtask_id=? AND event_type='CONFIRMATION_REQUIRED'
      ORDER BY created_at DESC, id DESC LIMIT 1`).get(jobId, subtaskId) as { id?: string } | undefined;
    if (row?.id) {
      this.repo.db.prepare("UPDATE events SET payload_json=? WHERE id=?")
        .run(JSON.stringify({ status: "WAITING_USER", question }), row.id);
      return;
    }
    this.insertEvent(jobId, subtaskId, "CONFIRMATION_REQUIRED", { status: "WAITING_USER", question });
  }

  private insertEvent(jobId: string, subtaskId: string | null, eventType: EventType, payload: Record<string, unknown>): void {
    this.repo.db.prepare("INSERT INTO events (id,job_id,subtask_id,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), jobId, subtaskId, eventType, JSON.stringify(payload), now());
  }

  private recalculateJobState(jobId: string): void {
    const detail = this.repo.getJob(jobId);
    if (["COMPLETED", "FAILED", "CANCELED"].includes(detail.job.status)) return;
    const current = detail.subtasks.filter((subtask) => subtask.planVersion === detail.job.planVersion);
    if (!current.length) return;

    const byId = new Map(detail.subtasks.map((subtask) => [subtask.id, subtask]));
    const dependencyDone = (dependencyId: string) => {
      const dependency = byId.get(dependencyId);
      return Boolean(
        dependency
        && dependency.status === "DONE"
        && this.isEffectiveForCurrentPlan(dependency, detail.job.planVersion),
      );
    };
    const runnable = current.some(
      (subtask) => subtask.status === "IN_PROGRESS"
        || (subtask.status === "TODO" && subtask.dependsOn.every(dependencyDone)),
    );
    const waiting = current.some((subtask) => subtask.status === "WAITING_USER");
    const target: JobStatus = !runnable && waiting ? "WAITING_USER" : "IN_PROGRESS";
    if (target !== detail.job.status) {
      this.repo.updateJob(jobId, { status: target });
    }
  }
}
