import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createAiOfficeMcpServer } from "../dist/src/mcp/createServer.js";
import { AI_OFFICE_VERSION } from "../dist/src/version.js";

async function createClient() {
  const { server, repo } = createAiOfficeMcpServer(":memory:");
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "ai-office-contract-test", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server, repo };
}

async function closeClient({ client, server, repo }) {
  await client.close();
  await server.close();
  repo.close();
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, undefined, `${name} failed: ${JSON.stringify(result.content)}`);
  return result.structuredContent;
}

test("release identifiers expose the same patch version", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const pluginJson = JSON.parse(await readFile(new URL("../.codex-plugin/plugin.json", import.meta.url), "utf8"));
  assert.equal(packageJson.version, AI_OFFICE_VERSION);
  assert.equal(pluginJson.version, AI_OFFICE_VERSION);
});

test("published MCP schema exposes completion evidence and ACTION confirmation inputs", async () => {
  const fixture = await createClient();
  try {
    assert.equal(fixture.client.getServerVersion().version, AI_OFFICE_VERSION);
    const { tools } = await fixture.client.listTools();
    const completeJob = tools.find((tool) => tool.name === "complete_job");
    const updateSubtask = tools.find((tool) => tool.name === "update_subtask");
    assert.ok(completeJob);
    assert.ok(updateSubtask);

    const evidenceSchema = completeJob.inputSchema.properties.completionEvidence.items;
    assert.ok(evidenceSchema.required.includes("sourceSubtaskIds"));
    assert.ok(updateSubtask.inputSchema.properties.userInput);
    assert.ok(updateSubtask.inputSchema.properties.waitingReason);
  } finally {
    await closeClient(fixture);
  }
});

test("a job can be completed using only the public MCP contract", async () => {
  const fixture = await createClient();
  try {
    const created = await call(fixture.client, "create_job", {
      title: "MCP完了テスト",
      request: "候補を調べて完了する",
      goal: "候補を確定する",
      completionCriteria: ["候補が確定している"],
      subtasks: [{ key: "research", type: "RESEARCH", instruction: "候補を調査する" }],
    });
    const jobId = created.context.job.id;
    const subtaskId = created.context.currentSubtasks[0].id;
    await call(fixture.client, "update_subtask", { subtaskId, status: "IN_PROGRESS" });
    await call(fixture.client, "update_subtask", {
      subtaskId,
      status: "DONE",
      output: "候補Aを選定",
    });
    const completed = await call(fixture.client, "complete_job", {
      jobId,
      finalOutput: "候補Aで確定",
      completionEvidence: [{
        criterion: "候補が確定している",
        evidence: "調査結果から候補Aを選定した",
        sourceSubtaskIds: [subtaskId],
      }],
    });
    assert.equal(completed.context.job.status, "COMPLETED");
  } finally {
    await closeClient(fixture);
  }
});

test("an ACTION can reach DONE through the public MCP contract with recorded user input", async () => {
  const fixture = await createClient();
  try {
    const created = await call(fixture.client, "create_job", {
      title: "ACTION完了テスト",
      request: "確認後に予約する",
      goal: "予約を完了する",
      completionCriteria: ["予約が完了している"],
      subtasks: [{ key: "action", type: "ACTION", instruction: "予約を実行する" }],
    });
    const jobId = created.context.job.id;
    const subtaskId = created.context.currentSubtasks[0].id;
    await call(fixture.client, "update_subtask", { subtaskId, status: "IN_PROGRESS" });
    const updated = await call(fixture.client, "update_subtask", {
      subtaskId,
      status: "DONE",
      output: "予約番号 ABC-123",
      userInput: "この内容で予約してよい",
    });
    assert.equal(updated.subtask.status, "DONE");
    assert.ok(updated.context.recentEvents.some((event) =>
      event.subtaskId === subtaskId
      && event.eventType === "USER_INPUT_RECEIVED"
      && event.payload.input === "この内容で予約してよい"));
    const completed = await call(fixture.client, "complete_job", {
      jobId,
      finalOutput: "予約番号 ABC-123で予約完了",
      completionEvidence: [{
        criterion: "予約が完了している",
        evidence: "利用者の確認後に予約番号が発行された",
        sourceSubtaskIds: [subtaskId],
      }],
    });
    assert.equal(completed.context.job.status, "COMPLETED");
  } finally {
    await closeClient(fixture);
  }
});
