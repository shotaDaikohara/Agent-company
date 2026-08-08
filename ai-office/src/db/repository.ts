import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA_SQL } from "./schema.js";
import {
  JOB_PRIORITIES,
  JOB_STATUSES,
  SUBTASK_STATUSES,
  SUBTASK_TYPES,
  type CompletionEvidence,
  type DashboardJob,
  type EventRecord,
  type EventType,
  type Job,
  type JobDetail,
  type JobPriority,
  type JobStatus,
  type Subtask,
  type SubtaskStatus,
  type SubtaskType,
} from "../domain/types.js";

function assertMember<T extends readonly string[]>(values: T, value: string, label: string): asserts value is T[number] {
  if (!values.includes(value)) throw new Error(`Invalid ${label}: ${value}`);
}

function now(): string {
  return new Date().toISOString();
}

export interface CreateSubtaskInput {
  id?: string;
  key?: string;
  type: SubtaskType;
  instruction: string;
  dependsOn?: string[];
  dependsOnKeys?: string[];
  status?: SubtaskStatus;
  output?: string | null;
}

export interface CreateJobInput {
  title: string;
  request: string;
  goal: string;
  completionCriteria: string[];
  priority?: JobPriority;
  subtasks?: CreateSubtaskInput[];
}

export class Repository {
  readonly db: DatabaseSync;

  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA_SQL);
    this.migrateSchema();
    if (path !== ":memory:") this.db.exec("PRAGMA journal_mode = WAL");
  }


  private migrateSchema(): void {
    const jobColumns = this.db.prepare("PRAGMA table_info(jobs)").all() as Array<Record<string, unknown>>;
    const jobNames = new Set(jobColumns.map((row) => String(row.name)));
    if (!jobNames.has("completion_evidence_json")) {
      this.db.exec("ALTER TABLE jobs ADD COLUMN completion_evidence_json TEXT NOT NULL DEFAULT '[]'");
    }

    const subtaskColumns = this.db.prepare("PRAGMA table_info(subtasks)").all() as Array<Record<string, unknown>>;
    const subtaskNames = new Set(subtaskColumns.map((row) => String(row.name)));
    if (!subtaskNames.has("sort_order")) {
      this.db.exec("ALTER TABLE subtasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0");
    }
    if (!subtaskNames.has("reused_in_plan_version")) {
      if (subtaskNames.has("reusable_from_plan_version")) {
        this.db.exec("ALTER TABLE subtasks RENAME COLUMN reusable_from_plan_version TO reused_in_plan_version");
      } else {
        this.db.exec("ALTER TABLE subtasks ADD COLUMN reused_in_plan_version INTEGER");
      }
    }
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  createJob(input: CreateJobInput): JobDetail {
    if (!input.title.trim()) throw new Error("title is required");
    if (!input.request.trim()) throw new Error("request is required");
    if (!input.goal.trim()) throw new Error("goal is required");
    if (!input.completionCriteria.length || input.completionCriteria.some((x) => !x.trim())) {
      throw new Error("completionCriteria must contain at least one non-empty item");
    }
    const priority = input.priority ?? "NORMAL";
    assertMember(JOB_PRIORITIES, priority, "priority");
    const jobId = randomUUID();
    const ts = now();

    return this.transaction(() => {
      this.db.prepare(`INSERT INTO jobs
        (id,title,request,goal,completion_criteria_json,priority,status,plan_version,final_output,completion_evidence_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(jobId, input.title.trim(), input.request.trim(), input.goal.trim(), JSON.stringify(input.completionCriteria), priority, "IN_PROGRESS", 1, null, "[]", ts, ts);

      this.insertSubtaskBatch(jobId, 1, input.subtasks ?? [], ts);
      this.insertEvent(jobId, null, "JOB_CREATED", { title: input.title }, ts);
      return this.getJob(jobId);
    });
  }


  private insertSubtaskBatch(jobId: string, planVersion: number, inputs: CreateSubtaskInput[], ts = now()): Subtask[] {
    const keyToId = new Map<string, string>();
    const resolved = inputs.map((input) => {
      if (input.key) {
        if (keyToId.has(input.key)) throw new Error(`Duplicate subtask key: ${input.key}`);
        keyToId.set(input.key, input.id ?? randomUUID());
      }
      return { input, id: input.id ?? "" };
    });

    const rows = resolved.map(({ input, id: presetId }) => {
      const id = input.key ? keyToId.get(input.key)! : presetId || randomUUID();
      const fromIds = input.dependsOn ?? [];
      const fromKeys = (input.dependsOnKeys ?? []).map((key) => {
        const dependencyId = keyToId.get(key);
        if (!dependencyId) throw new Error(`Unknown dependsOn key: ${key}`);
        return dependencyId;
      });
      const dependsOn = [...new Set([...fromIds, ...fromKeys])];
      if (dependsOn.includes(id)) throw new Error(`Subtask cannot depend on itself: ${input.key ?? id}`);
      return { ...input, id, dependsOn };
    });

    const idsInBatch = new Set(rows.map((row) => row.id));
    const graph = new Map(rows.map((row) => [row.id, row.dependsOn.filter((id) => idsInBatch.has(id))]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error("Subtask dependency cycle detected");
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependencyId of graph.get(id) ?? []) visit(dependencyId);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of graph.keys()) visit(id);

    return rows.map((input, sortOrder) => this.insertSubtask(jobId, planVersion, input, sortOrder, ts));
  }

  private insertSubtask(jobId: string, planVersion: number, input: CreateSubtaskInput, sortOrder: number, ts = now()): Subtask {
    assertMember(SUBTASK_TYPES, input.type, "subtask type");
    const status = input.status ?? "TODO";
    assertMember(SUBTASK_STATUSES, status, "subtask status");
    if (!input.instruction.trim()) throw new Error("subtask instruction is required");
    const id = input.id ?? randomUUID();
    this.db.prepare(`INSERT INTO subtasks
      (id,job_id,type,instruction,depends_on_json,status,output,plan_version,sort_order,reused_in_plan_version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, jobId, input.type, input.instruction.trim(), JSON.stringify(input.dependsOn ?? []), status, input.output ?? null, planVersion, sortOrder, null, ts, ts);
    return this.getSubtask(id);
  }

  listJobs(filters: { status?: JobStatus; priority?: JobPriority } = {}): Job[] {
    if (filters.status) assertMember(JOB_STATUSES, filters.status, "status");
    if (filters.priority) assertMember(JOB_PRIORITIES, filters.priority, "priority");
    const where: string[] = [];
    const args: string[] = [];
    if (filters.status) { where.push("status = ?"); args.push(filters.status); }
    if (filters.priority) { where.push("priority = ?"); args.push(filters.priority); }
    const sql = `SELECT * FROM jobs${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY
      CASE priority WHEN 'HIGH' THEN 0 WHEN 'NORMAL' THEN 1 ELSE 2 END,
      updated_at DESC`;
    return this.db.prepare(sql).all(...args).map((row) => this.mapJob(row as Record<string, unknown>));
  }

  getJob(jobId: string): JobDetail {
    const row = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Job not found: ${jobId}`);
    const job = this.mapJob(row);
    const subtasks = this.db.prepare("SELECT * FROM subtasks WHERE job_id = ? ORDER BY plan_version, sort_order, created_at, id").all(jobId)
      .map((r) => this.mapSubtask(r as Record<string, unknown>));
    const events = this.db.prepare("SELECT * FROM events WHERE job_id = ? ORDER BY created_at, id").all(jobId)
      .map((r) => this.mapEvent(r as Record<string, unknown>));
    return { job, subtasks, events };
  }

  getSubtask(id: string): Subtask {
    const row = this.db.prepare("SELECT * FROM subtasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Subtask not found: ${id}`);
    return this.mapSubtask(row);
  }

  updateJob(jobId: string, patch: { title?: string; goal?: string; completionCriteria?: string[]; status?: JobStatus; finalOutput?: string | null }): JobDetail {
    const current = this.getJob(jobId).job;
    if (patch.status) assertMember(JOB_STATUSES, patch.status, "status");
    const title = patch.title ?? current.title;
    const goal = patch.goal ?? current.goal;
    const criteria = patch.completionCriteria ?? current.completionCriteria;
    if (!title.trim() || !goal.trim() || !criteria.length) throw new Error("title, goal, completionCriteria must be non-empty");
    const status = patch.status ?? current.status;
    const finalOutput = patch.finalOutput !== undefined ? patch.finalOutput : current.finalOutput;
    const ts = now();
    const criteriaChanged = patch.completionCriteria !== undefined;
    this.db.prepare(`UPDATE jobs SET title=?, goal=?, completion_criteria_json=?, status=?, final_output=?, completion_evidence_json=?, updated_at=? WHERE id=?`)
      .run(title.trim(), goal.trim(), JSON.stringify(criteria), status, finalOutput, criteriaChanged ? "[]" : JSON.stringify(current.completionEvidence), ts, jobId);
    this.insertEvent(jobId, null, "JOB_UPDATED", { fields: Object.keys(patch) }, ts);
    return this.getJob(jobId);
  }

  updatePriority(jobId: string, priority: JobPriority): JobDetail {
    assertMember(JOB_PRIORITIES, priority, "priority");
    this.getJob(jobId);
    const ts = now();
    this.db.prepare("UPDATE jobs SET priority=?, updated_at=? WHERE id=?").run(priority, ts, jobId);
    this.insertEvent(jobId, null, "PRIORITY_CHANGED", { priority }, ts);
    return this.getJob(jobId);
  }

  updateSubtask(id: string, patch: { status?: SubtaskStatus; output?: string | null }): Subtask {
    const current = this.getSubtask(id);
    const status = patch.status ?? current.status;
    assertMember(SUBTASK_STATUSES, status, "subtask status");
    const output = patch.output !== undefined ? patch.output : current.output;
    if (status === "DONE" && !output?.trim()) throw new Error("DONE subtask requires output");
    const ts = now();
    this.db.prepare("UPDATE subtasks SET status=?, output=?, updated_at=? WHERE id=?").run(status, output, ts, id);
    this.db.prepare("UPDATE jobs SET updated_at=? WHERE id=?").run(ts, current.jobId);
    this.insertEvent(current.jobId, id, status === "WAITING_USER" ? "CONFIRMATION_REQUIRED" : "SUBTASK_UPDATED", { status }, ts);
    this.recalculateJobBlockingState(current.jobId);
    return this.getSubtask(id);
  }

  replacePlan(jobId: string, input: { goal?: string; completionCriteria?: string[]; subtasks: CreateSubtaskInput[]; reuseSubtaskIds?: string[] }): JobDetail {
    if (!input.subtasks.length) throw new Error("replacement plan requires at least one subtask");
    return this.transaction(() => {
      const detail = this.getJob(jobId);
      if (["COMPLETED", "FAILED", "CANCELED"].includes(detail.job.status)) throw new Error(`Cannot replace plan for ${detail.job.status} job`);
      const nextVersion = detail.job.planVersion + 1;
      const ts = now();
      const reuse = new Set(input.reuseSubtaskIds ?? []);
      for (const id of reuse) {
        const st = detail.subtasks.find((x) => x.id === id);
        if (!st) throw new Error(`Reusable subtask not found in job: ${id}`);
        if (st.status !== "DONE" || !st.output) throw new Error(`Reusable subtask must be DONE with output: ${id}`);
      }
      this.db.prepare("UPDATE subtasks SET status='CANCELED', updated_at=? WHERE job_id=? AND plan_version=? AND status NOT IN ('DONE','CANCELED')")
        .run(ts, jobId, detail.job.planVersion);
      for (const id of reuse) {
        this.db.prepare("UPDATE subtasks SET reused_in_plan_version=?, updated_at=? WHERE id=?")
          .run(nextVersion, ts, id);
      }
      this.db.prepare("UPDATE jobs SET goal=?, completion_criteria_json=?, plan_version=?, status='IN_PROGRESS', final_output=NULL, completion_evidence_json='[]', updated_at=? WHERE id=?")
        .run(input.goal ?? detail.job.goal, JSON.stringify(input.completionCriteria ?? detail.job.completionCriteria), nextVersion, ts, jobId);
      this.insertSubtaskBatch(jobId, nextVersion, input.subtasks, ts);
      this.insertEvent(jobId, null, "PLAN_REPLACED", { from: detail.job.planVersion, to: nextVersion, reused: [...reuse] }, ts);
      return this.getJob(jobId);
    });
  }

  cancelJob(jobId: string): JobDetail {
    return this.transaction(() => {
      const detail = this.getJob(jobId);
      if (detail.job.status === "COMPLETED") throw new Error("Completed job cannot be canceled");
      const ts = now();
      this.db.prepare("UPDATE jobs SET status='CANCELED', updated_at=? WHERE id=?").run(ts, jobId);
      this.db.prepare("UPDATE subtasks SET status='CANCELED', updated_at=? WHERE job_id=? AND status NOT IN ('DONE','CANCELED')").run(ts, jobId);
      this.insertEvent(jobId, null, "JOB_CANCELED", {}, ts);
      return this.getJob(jobId);
    });
  }

  completeJob(jobId: string, finalOutput: string, completionEvidence: CompletionEvidence[]): JobDetail {
    return this.transaction(() => {
      const detail = this.getJob(jobId);
      if (!finalOutput.trim()) throw new Error("finalOutput is required");
      if (["COMPLETED", "FAILED", "CANCELED"].includes(detail.job.status)) throw new Error(`Cannot complete ${detail.job.status} job`);
      const current = detail.subtasks.filter((st) => st.planVersion === detail.job.planVersion);
      const blockers = current.filter((st) => !["DONE", "CANCELED"].includes(st.status));
      if (blockers.length) throw new Error(`Cannot complete job: ${blockers.length} current subtasks are unfinished`);
      if (!detail.job.completionCriteria.length) throw new Error("Cannot complete job without completion criteria");
      const evidenceByCriterion = new Map(completionEvidence.map((item) => [item.criterion, item.evidence.trim()]));
      const missingEvidence = detail.job.completionCriteria.filter((criterion) => !evidenceByCriterion.get(criterion));
      if (missingEvidence.length) throw new Error(`Cannot complete job: missing completion evidence for ${missingEvidence.join(", ")}`);
      const normalizedEvidence = detail.job.completionCriteria.map((criterion) => ({ criterion, evidence: evidenceByCriterion.get(criterion)! }));
      const ts = now();
      this.db.prepare("UPDATE jobs SET status='COMPLETED', final_output=?, completion_evidence_json=?, updated_at=? WHERE id=?").run(finalOutput.trim(), JSON.stringify(normalizedEvidence), ts, jobId);
      this.insertEvent(jobId, null, "JOB_COMPLETED", {}, ts);
      return this.getJob(jobId);
    });
  }

  getDashboard(): DashboardJob[] {
    return this.listJobs().map((job) => {
      const subtasks = this.getJob(job.id).subtasks.filter((st) => st.planVersion === job.planVersion);
      const current = subtasks.find((st) => st.status === "IN_PROGRESS") ?? subtasks.find((st) => st.status === "WAITING_USER") ?? subtasks.find((st) => st.status === "TODO") ?? null;
      return {
        id: job.id,
        title: job.title,
        goal: job.goal,
        priority: job.priority,
        status: job.status,
        currentStep: current?.instruction ?? null,
        waitingReason: current?.status === "WAITING_USER" ? current.instruction : null,
        completedCount: subtasks.filter((st) => st.status === "DONE").length,
        totalCount: subtasks.length,
        updatedAt: job.updatedAt,
      };
    });
  }

  private recalculateJobBlockingState(jobId: string): void {
    const detail = this.getJob(jobId);
    if (["COMPLETED", "FAILED", "CANCELED"].includes(detail.job.status)) return;
    const current = detail.subtasks.filter((st) => st.planVersion === detail.job.planVersion);
    if (!current.length) return;
    const allBlocked = current.every((st) => ["DONE", "CANCELED", "WAITING_USER"].includes(st.status)) && current.some((st) => st.status === "WAITING_USER");
    const target: JobStatus = allBlocked ? "WAITING_USER" : "IN_PROGRESS";
    if (target !== detail.job.status) {
      const ts = now();
      this.db.prepare("UPDATE jobs SET status=?, updated_at=? WHERE id=?").run(target, ts, jobId);
      this.insertEvent(jobId, null, "JOB_UPDATED", { status: target }, ts);
    }
  }

  private insertEvent(jobId: string, subtaskId: string | null, eventType: EventType, payload: Record<string, unknown>, ts = now()): void {
    this.db.prepare("INSERT INTO events (id,job_id,subtask_id,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?)")
      .run(randomUUID(), jobId, subtaskId, eventType, JSON.stringify(payload), ts);
  }

  private mapJob(row: Record<string, unknown>): Job {
    const status = String(row.status); assertMember(JOB_STATUSES, status, "stored Job status");
    const priority = String(row.priority); assertMember(JOB_PRIORITIES, priority, "stored priority");
    return {
      id: String(row.id), title: String(row.title), request: String(row.request), goal: String(row.goal),
      completionCriteria: JSON.parse(String(row.completion_criteria_json)) as string[], priority, status,
      planVersion: Number(row.plan_version), finalOutput: row.final_output == null ? null : String(row.final_output),
      completionEvidence: JSON.parse(String(row.completion_evidence_json ?? "[]")) as CompletionEvidence[],
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  private mapSubtask(row: Record<string, unknown>): Subtask {
    const type = String(row.type); assertMember(SUBTASK_TYPES, type, "stored subtask type");
    const status = String(row.status); assertMember(SUBTASK_STATUSES, status, "stored subtask status");
    return {
      id: String(row.id), jobId: String(row.job_id), type, instruction: String(row.instruction),
      dependsOn: JSON.parse(String(row.depends_on_json)) as string[], status,
      output: row.output == null ? null : String(row.output), planVersion: Number(row.plan_version),
      sortOrder: Number(row.sort_order ?? 0),
      reusedInPlanVersion: row.reused_in_plan_version == null ? null : Number(row.reused_in_plan_version),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    };
  }

  private mapEvent(row: Record<string, unknown>): EventRecord {
    return {
      id: String(row.id), jobId: String(row.job_id), subtaskId: row.subtask_id == null ? null : String(row.subtask_id),
      eventType: String(row.event_type) as EventType, payload: JSON.parse(String(row.payload_json)) as Record<string, unknown>, createdAt: String(row.created_at),
    };
  }
}
