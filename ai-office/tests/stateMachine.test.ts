import test from "node:test";
import assert from "node:assert/strict";
import { assertJobTransition, assertSubtaskTransition } from "../src/domain/stateMachine.js";

test("allows active job transitions", () => {
  assert.doesNotThrow(() => assertJobTransition("IN_PROGRESS", "WAITING_USER"));
  assert.doesNotThrow(() => assertJobTransition("WAITING_USER", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertJobTransition("IN_PROGRESS", "COMPLETED"));
});

test("rejects terminal job transition", () => {
  assert.throws(() => assertJobTransition("COMPLETED", "IN_PROGRESS"), /Invalid Job status transition/);
});

test("requires terminal subtask states to stay terminal", () => {
  assert.doesNotThrow(() => assertSubtaskTransition("DONE", "DONE"));
  assert.throws(() => assertSubtaskTransition("DONE", "IN_PROGRESS"));
});
