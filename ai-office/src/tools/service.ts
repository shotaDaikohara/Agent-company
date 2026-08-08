import { Repository, type CreateJobInput, type CreateSubtaskInput } from "../db/repository.js";
import { assertJobTransition, assertSubtaskTransition } from "../domain/stateMachine.js";
import type { CompletionEvidence, JobPriority, JobStatus, SubtaskStatus } from "../domain/types.js";

export class AiOfficeService {
  constructor(readonly repo: Repository) {}

  createJob(input: CreateJobInput) { return this.repo.createJob(input); }
  listJobs(input: { status?: JobStatus; priority?: JobPriority } = {}) { return this.repo.listJobs(input); }
  getJob(jobId: string) { return this.repo.getJob(jobId); }
  getDashboard() { return this.repo.getDashboard(); }

  updateJob(jobId: string, patch: { title?: string; goal?: string; completionCriteria?: string[]; status?: JobStatus; finalOutput?: string | null }) {
    const current = this.repo.getJob(jobId).job;
    if (patch.status) assertJobTransition(current.status, patch.status);
    return this.repo.updateJob(jobId, patch);
  }

  updateSubtask(id: string, patch: { status?: SubtaskStatus; output?: string | null }) {
    const current = this.repo.getSubtask(id);
    if (patch.status) assertSubtaskTransition(current.status, patch.status);
    if (patch.status === "IN_PROGRESS") {
      const detail = this.repo.getJob(current.jobId);
      for (const dependencyId of current.dependsOn) {
        const dependency = detail.subtasks.find((subtask) => subtask.id === dependencyId);
        if (!dependency) throw new Error(`Dependency not found: ${dependencyId}`);
        const validForCurrentPlan = dependency.planVersion === detail.job.planVersion || dependency.reusedInPlanVersion === detail.job.planVersion;
        if (dependency.status !== "DONE" || !validForCurrentPlan) {
          throw new Error(`Subtask dependency is not complete for current plan: ${dependencyId}`);
        }
      }
    }
    return this.repo.updateSubtask(id, patch);
  }

  replacePlan(jobId: string, input: { goal?: string; completionCriteria?: string[]; subtasks: CreateSubtaskInput[]; reuseSubtaskIds?: string[] }) {
    return this.repo.replacePlan(jobId, input);
  }

  changePriority(jobId: string, priority: JobPriority) { return this.repo.updatePriority(jobId, priority); }
  cancelJob(jobId: string) { return this.repo.cancelJob(jobId); }
  completeJob(jobId: string, finalOutput: string, completionEvidence: CompletionEvidence[]) { return this.repo.completeJob(jobId, finalOutput, completionEvidence); }
}
