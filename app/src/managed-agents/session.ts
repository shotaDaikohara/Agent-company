import { client } from "./client.js";
import { loadManagedAgentsConfig } from "./config.js";

/**
 * 新しいProjectに対応するSessionを作成し、最初のユーザー依頼を送信する。
 * technical-design.md 2.2「Project = Session」に対応。
 */
export async function createProjectSession(params: {
  goal: string;
  memoryStoreIds?: string[];
}): Promise<{ sessionId: string }> {
  const config = loadManagedAgentsConfig();

  const resources = (params.memoryStoreIds ?? []).map((memoryStoreId) => ({
    type: "memory_store" as const,
    memory_store_id: memoryStoreId,
    access: "read_write" as const,
    instructions:
      "ユーザーの基本情報や過去Projectで確定した事実。既知の情報を再質問しないこと。",
  }));

  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: config.agentId, version: config.agentVersion },
    environment_id: config.environmentId,
    title: params.goal.slice(0, 80),
    resources,
    initial_events: [
      {
        type: "user.message",
        content: [{ type: "text", text: params.goal }],
      },
    ],
  });

  return { sessionId: session.id };
}

/** Projectへの追加のユーザー入力（例:「15万円まで」）を送信する。 */
export async function sendUserMessage(sessionId: string, text: string): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.message", content: [{ type: "text", text }] }],
  });
}

/** 方針変更・割り込み（SC-05）。現在の処理を停止する。 */
export async function interruptSession(sessionId: string): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [{ type: "user.interrupt" }],
  });
}

/**
 * 不可逆操作（permission_policy: always_ask）への応答。
 * toolUseEventId は該当する agent.tool_use / agent.mcp_tool_use イベントの id。
 */
export async function respondToolConfirmation(
  sessionId: string,
  toolUseEventId: string,
  result: "allow" | "deny",
  denyMessage?: string,
): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: "user.tool_confirmation",
        tool_use_id: toolUseEventId,
        result,
        ...(result === "deny" && denyMessage ? { deny_message: denyMessage } : {}),
      },
    ],
  });
}

/** Sessionの現在の状態（idle/running等）を取得する。 */
export async function getSessionStatus(sessionId: string) {
  return client.beta.sessions.retrieve(sessionId);
}
