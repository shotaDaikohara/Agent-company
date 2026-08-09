import test from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../src/db/repository.js";
import { AiOfficeService } from "../src/tools/service.js";

function createService() {
  const repo = new Repository(":memory:");
  return { repo, service: new AiOfficeService(repo) };
}

test("SC-10: multiple jobs remain independent when one waits for user", () => {
  const { repo, service } = createService();
  const insurance = service.createJob({
    title: "保険更新",
    request: "保険更新を進めて",
    goal: "保険更新を期限内に完了できる状態にする",
    completionCriteria: ["更新条件が確認されている"],
    priority: "HIGH",
    subtasks: [{ key: "confirm", type: "ACTION", instruction: "更新前の確認を取る" }],
  });
  const travel = service.createJob({
    title: "旅行予約",
    request: "旅行予約を進めて",
    goal: "旅行候補を比較する",
    completionCriteria: ["候補が比較されている"],
    priority: "LOW",
    subtasks: [{ key: "research", type: "RESEARCH", instruction: "旅行候補を調査する" }],
  });

  service.updateSubtask(insurance.subtasks[0].id, { status: "WAITING_USER", waitingReason: "更新条件を承認しますか？" });
  assert.equal(service.getJob(insurance.job.id).job.status, "WAITING_USER");

  service.updateSubtask(travel.subtasks[0].id, { status: "IN_PROGRESS" });
  service.updateSubtask(travel.subtasks[0].id, { status: "DONE", output: "候補3件を比較" });
  service.changePriority(travel.job.id, "NORMAL");

  const insuranceAfter = service.getJob(insurance.job.id);
  const travelAfter = service.getJob(travel.job.id);
  assert.equal(insuranceAfter.job.status, "WAITING_USER");
  assert.equal(insuranceAfter.job.priority, "HIGH");
  assert.equal(travelAfter.job.priority, "NORMAL");
  assert.equal(travelAfter.subtasks[0].output, "候補3件を比較");
  assert.notEqual(insuranceAfter.job.id, travelAfter.job.id);
  repo.close();
});

test("SC-05: material direction change replaces only the plan and excludes obsolete output", () => {
  const { repo, service } = createService();
  const original = service.createJob({
    title: "夏休み旅行",
    request: "沖縄で計画して",
    goal: "沖縄旅行を計画する",
    completionCriteria: ["交通と宿泊の案がある"],
    subtasks: [
      { key: "family", type: "RESEARCH", instruction: "家族条件を整理する" },
      { key: "flight", type: "RESEARCH", instruction: "航空券を調査する" },
    ],
  });
  const family = original.subtasks[0];
  const flight = original.subtasks[1];
  service.updateSubtask(family.id, { status: "IN_PROGRESS" });
  service.updateSubtask(family.id, { status: "DONE", output: "大人2名・子ども1名" });
  service.updateSubtask(flight.id, { status: "IN_PROGRESS" });
  service.updateSubtask(flight.id, { status: "DONE", output: "沖縄便の調査結果" });

  const replanned = service.replacePlan(original.job.id, {
    goal: "電車だけで行ける家族旅行を計画する",
    completionCriteria: ["鉄道だけで移動できる案がある"],
    reuseSubtaskIds: [family.id],
    subtasks: [
      { key: "rail", type: "RESEARCH", instruction: "鉄道だけで行ける候補を調査する" },
      { key: "plan", type: "CREATE", instruction: "鉄道旅行案を作る", dependsOnKeys: ["rail"] },
    ],
  });

  assert.equal(replanned.job.planVersion, 2);
  assert.equal(replanned.job.goal, "電車だけで行ける家族旅行を計画する");
  assert.equal(replanned.subtasks.find((s) => s.id === family.id)?.reusedInPlanVersion, 2);
  assert.equal(replanned.subtasks.find((s) => s.id === flight.id)?.reusedInPlanVersion, null);
  assert.ok(replanned.subtasks.filter((s) => s.planVersion === 2).every((s) => !s.output?.includes("沖縄")));
  repo.close();
});

test("SC-06: simulated reservation cannot be reported as completed while action is waiting", () => {
  const { repo, service } = createService();
  const reservation = service.createJob({
    title: "レストラン予約",
    request: "土曜19時に渋谷で4人予約して",
    goal: "条件に合う店の予約を完了する",
    completionCriteria: ["予約が実行済みで成功証跡がある"],
    subtasks: [
      { key: "research", type: "RESEARCH", instruction: "候補店を調査する" },
      { key: "action", type: "ACTION", instruction: "予約直前の確認を取る", dependsOnKeys: ["research"] },
    ],
  });
  const research = reservation.subtasks[0];
  const action = reservation.subtasks[1];
  service.updateSubtask(research.id, { status: "IN_PROGRESS" });
  service.updateSubtask(research.id, { status: "DONE", output: "店舗Aを候補として選定" });
  service.updateSubtask(action.id, { status: "IN_PROGRESS" });
  service.updateSubtask(action.id, {
    status: "WAITING_USER",
    output: "SIMULATED: 予約直前。確定は未実行",
    waitingReason: "店舗Aをこの条件で予約してよいですか？",
  });

  assert.equal(service.getJob(reservation.job.id).job.status, "WAITING_USER");
  assert.throws(
    () => service.completeJob(reservation.job.id, "予約完了", [
      {
        criterion: "予約が実行済みで成功証跡がある",
        evidence: "SIMULATED",
        sourceSubtaskIds: [action.id],
      },
    ]),
    /not DONE|unfinished|WAITING_USER/,
  );
  repo.close();
});

test("SC-06 regression: ACTION cannot be fabricated as complete without explicit user input", () => {
  const { repo, service } = createService();
  const reservation = service.createJob({
    title: "レストラン予約",
    request: "予約して",
    goal: "予約を完了する",
    completionCriteria: ["予約が実行済みで成功証跡がある"],
    subtasks: [{ key: "action", type: "ACTION", instruction: "予約を実行する" }],
  });
  const action = reservation.subtasks[0];
  service.updateSubtask(action.id, { status: "IN_PROGRESS" });
  assert.throws(
    () => service.updateSubtask(action.id, { status: "DONE", output: "予約番号 ABC-123" }),
    /ACTION cannot be marked DONE/,
  );
  repo.close();
});
