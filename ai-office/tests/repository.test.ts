import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Repository } from "../src/db/repository.js";
import { AiOfficeService } from "../src/tools/service.js";

function createService(path = ":memory:") {
  const repo = new Repository(path);
  return { repo, service: new AiOfficeService(repo) };
}

function sampleJob(service: AiOfficeService, title = "旅行") {
  return service.createJob({
    title,
    request: `${title}を計画して`,
    goal: `${title}を実施可能な状態にする`,
    completionCriteria: ["候補が整理されている", "未完了事項が明示されている"],
    subtasks: [
      { key: "research", type: "RESEARCH", instruction: "候補を調査する" },
      { key: "create", type: "CREATE", instruction: "計画を作成する", dependsOnKeys: ["research"] },
      { key: "review", type: "REVIEW", instruction: "完了条件を確認する", dependsOnKeys: ["create"] },
    ],
  });
}

test("creates and retrieves independent jobs", () => {
  const { repo, service } = createService();
  const a = sampleJob(service, "旅行");
  const b = sampleJob(service, "引越し");
  assert.notEqual(a.job.id, b.job.id);
  assert.equal(service.getJob(a.job.id).job.title, "旅行");
  assert.equal(service.getJob(b.job.id).job.title, "引越し");
  assert.equal(service.listJobs().length, 2);
  repo.close();
});

test("persists jobs across repository reopen", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-office-"));
  const path = join(dir, "state.sqlite");
  const first = createService(path);
  const created = sampleJob(first.service);
  first.repo.close();
  const second = createService(path);
  assert.equal(second.service.getJob(created.job.id).job.title, "旅行");
  second.repo.close();
  rmSync(dir, { recursive: true, force: true });
});

test("DONE subtask requires output", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  const subtask = detail.subtasks[0];
  service.updateSubtask(subtask.id, { status: "IN_PROGRESS" });
  assert.throws(() => service.updateSubtask(subtask.id, { status: "DONE" }), /requires output/);
  const done = service.updateSubtask(subtask.id, { status: "DONE", output: "軽井沢を候補として確認" });
  assert.equal(done.status, "DONE");
  repo.close();
});

test("plan replacement increments version and prevents implicit old-plan use", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  const oldResearch = detail.subtasks[0];
  service.updateSubtask(oldResearch.id, { status: "IN_PROGRESS" });
  service.updateSubtask(oldResearch.id, { status: "DONE", output: "沖縄調査結果" });
  const replaced = service.replacePlan(detail.job.id, {
    goal: "鉄道だけで行ける旅行を計画する",
    reuseSubtaskIds: [],
    subtasks: [
      { type: "RESEARCH", instruction: "鉄道で行ける候補を調査する" },
      { type: "CREATE", instruction: "鉄道旅行案を作成する" },
      { type: "REVIEW", instruction: "新方針との整合性を確認する" },
    ],
  });
  assert.equal(replaced.job.planVersion, 2);
  assert.equal(replaced.subtasks.filter((s) => s.planVersion === 2).length, 3);
  const old = replaced.subtasks.find((s) => s.id === oldResearch.id)!;
  assert.equal(old.reusedInPlanVersion, null);
  repo.close();
});

test("waiting user on one subtask blocks job only when all remaining work is blocked", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  service.updateSubtask(detail.subtasks[0].id, { status: "WAITING_USER" });
  assert.equal(service.getJob(detail.job.id).job.status, "IN_PROGRESS");
  service.updateSubtask(detail.subtasks[1].id, { status: "WAITING_USER" });
  service.updateSubtask(detail.subtasks[2].id, { status: "WAITING_USER" });
  assert.equal(service.getJob(detail.job.id).job.status, "WAITING_USER");
  repo.close();
});

test("cannot complete job while current subtasks are unfinished", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  assert.throws(() => service.completeJob(detail.job.id, "完成", []), /unfinished/);
  for (const st of detail.subtasks) {
    service.updateSubtask(st.id, { status: "IN_PROGRESS" });
    service.updateSubtask(st.id, { status: "DONE", output: `${st.type} done` });
  }
  const completed = service.completeJob(detail.job.id, "旅行計画完成", [
    { criterion: "候補が整理されている", evidence: "調査サブタスクで候補を整理済み" },
    { criterion: "未完了事項が明示されている", evidence: "最終成果に未完了事項を記載" },
  ]);
  assert.equal(completed.job.status, "COMPLETED");
  assert.equal(completed.job.finalOutput, "旅行計画完成");
  repo.close();
});

test("cancel keeps history and does not delete completed subtasks", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  service.updateSubtask(detail.subtasks[0].id, { status: "IN_PROGRESS" });
  service.updateSubtask(detail.subtasks[0].id, { status: "DONE", output: "調査済み" });
  const canceled = service.cancelJob(detail.job.id);
  assert.equal(canceled.job.status, "CANCELED");
  assert.equal(canceled.subtasks[0].status, "DONE");
  assert.equal(canceled.subtasks[1].status, "CANCELED");
  assert.ok(canceled.events.some((e) => e.eventType === "JOB_CANCELED"));
  repo.close();
});


test("resolves subtask dependency keys to generated IDs", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  const research = detail.subtasks.find((s) => s.type === "RESEARCH")!;
  const create = detail.subtasks.find((s) => s.type === "CREATE")!;
  const review = detail.subtasks.find((s) => s.type === "REVIEW")!;
  assert.equal(create.dependsOn[0], research.id);
  assert.equal(review.dependsOn[0], create.id);
  repo.close();
});

test("complete job requires evidence for every completion criterion", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  for (const st of detail.subtasks) {
    service.updateSubtask(st.id, { status: "IN_PROGRESS" });
    service.updateSubtask(st.id, { status: "DONE", output: `${st.type} done` });
  }
  assert.throws(() => service.completeJob(detail.job.id, "完成", [
    { criterion: "候補が整理されている", evidence: "候補あり" },
  ]), /missing completion evidence/);
  repo.close();
});

test("explicitly reused old output is tied to the new plan version", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  const old = detail.subtasks[0];
  service.updateSubtask(old.id, { status: "IN_PROGRESS" });
  service.updateSubtask(old.id, { status: "DONE", output: "再利用する家族条件" });
  const replaced = service.replacePlan(detail.job.id, {
    reuseSubtaskIds: [old.id],
    subtasks: [{ key: "new", type: "CREATE", instruction: "新しい計画を作る" }],
  });
  const reused = replaced.subtasks.find((s) => s.id === old.id)!;
  assert.equal(reused.reusedInPlanVersion, 2);
  repo.close();
});


test("rejects cyclic subtask dependencies", () => {
  const { repo, service } = createService();
  assert.throws(() => service.createJob({
    title: "循環", request: "循環テスト", goal: "完了", completionCriteria: ["完了"],
    subtasks: [
      { key: "a", type: "RESEARCH", instruction: "A", dependsOnKeys: ["b"] },
      { key: "b", type: "CREATE", instruction: "B", dependsOnKeys: ["a"] },
    ],
  }), /cycle/);
  repo.close();
});

test("cannot start subtask until dependencies are done", () => {
  const { repo, service } = createService();
  const detail = sampleJob(service);
  const research = detail.subtasks.find((s) => s.type === "RESEARCH")!;
  const create = detail.subtasks.find((s) => s.type === "CREATE")!;
  assert.throws(() => service.updateSubtask(create.id, { status: "IN_PROGRESS" }), /dependency/);
  service.updateSubtask(research.id, { status: "IN_PROGRESS" });
  service.updateSubtask(research.id, { status: "DONE", output: "調査完了" });
  assert.equal(service.updateSubtask(create.id, { status: "IN_PROGRESS" }).status, "IN_PROGRESS");
  repo.close();
});

test("migrates legacy schema columns without losing data", () => {
  const dir = mkdtempSync(join(tmpdir(), "ai-office-migrate-"));
  const path = join(dir, "legacy.sqlite");
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, request TEXT NOT NULL, goal TEXT NOT NULL,
      completion_criteria_json TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL,
      plan_version INTEGER NOT NULL DEFAULT 1, final_output TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE subtasks (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), type TEXT NOT NULL, instruction TEXT NOT NULL,
      depends_on_json TEXT NOT NULL, status TEXT NOT NULL, output TEXT, plan_version INTEGER NOT NULL,
      reusable_from_plan_version INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), subtask_id TEXT REFERENCES subtasks(id),
      event_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    INSERT INTO jobs VALUES ('legacy-job','旧案件','旧依頼','旧ゴール','["条件"]','NORMAL','IN_PROGRESS',1,NULL,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');
    INSERT INTO subtasks VALUES ('legacy-task','legacy-job','RESEARCH','旧調査','[]','DONE','旧成果',1,NULL,'2026-08-08T00:00:00Z','2026-08-08T00:00:00Z');
  `);
  legacy.close();

  const migrated = createService(path);
  const detail = migrated.service.getJob("legacy-job");
  assert.equal(detail.job.title, "旧案件");
  assert.equal(detail.job.completionEvidence.length, 0);
  assert.equal(detail.subtasks[0].sortOrder, 0);
  assert.equal(detail.subtasks[0].reusedInPlanVersion, null);
  migrated.repo.close();
  rmSync(dir, { recursive: true, force: true });
});
