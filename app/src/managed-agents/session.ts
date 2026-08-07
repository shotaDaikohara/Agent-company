import Anthropic from "@anthropic-ai/sdk";
import { client } from "./client.js";
import { loadManagedAgentsConfig } from "./config.js";

export type SessionEvent = Anthropic.Beta.Sessions.BetaManagedAgentsSessionEvent;

/**
 * 新しいProjectに対応するSessionを作成し、最初のユーザー依頼を送信する。
 * technical-design.md 2.2「Project = Session」に対応。
 *
 * rubric を指定すると、通常の user.message の代わりに user.define_outcome を送り、
 * R-10（完遂責任）をOutcomeのグレーダーに委ねる（テストシナリオの「合格条件」節を
 * rubricとして転用する想定 — technical-design.md 8章）。
 */
export async function createProjectSession(params: {
  goal: string;
  memoryStoreIds?: string[];
  rubric?: string;
}): Promise<{ sessionId: string }> {
  const config = loadManagedAgentsConfig();

  const resources = (params.memoryStoreIds ?? []).map((memoryStoreId) => ({
    type: "memory_store" as const,
    memory_store_id: memoryStoreId,
    access: "read_write" as const,
    instructions:
      "ユーザーの基本情報や過去Projectで確定した事実。既知の情報を再質問しないこと。",
  }));

  const initialEvents = params.rubric
    ? [
        {
          type: "user.define_outcome" as const,
          description: params.goal,
          rubric: { type: "text" as const, content: params.rubric },
        },
      ]
    : [
        {
          type: "user.message" as const,
          content: [{ type: "text" as const, text: params.goal }],
        },
      ];

  const session = await client.beta.sessions.create({
    agent: { type: "agent", id: config.agentId, version: config.agentVersion },
    environment_id: config.environmentId,
    title: params.goal.slice(0, 80),
    resources,
    initial_events: initialEvents,
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

/**
 * execute_external_action（自前のcustom tool）への応答。
 * agent_toolset/MCPの always_ask とは異なり、custom toolにはpermission_policyが適用されない
 * ため、承認が下りるまで user.custom_tool_result を意図的に送らないことで確認フローを実現する
 * （customTools.ts, technical-design.md 2.4参照）。
 */
export async function respondCustomToolResult(
  sessionId: string,
  customToolUseEventId: string,
  resultText: string,
  isError = false,
): Promise<void> {
  await client.beta.sessions.events.send(sessionId, {
    events: [
      {
        type: "user.custom_tool_result",
        custom_tool_use_id: customToolUseEventId,
        content: [{ type: "text", text: resultText }],
        is_error: isError,
      },
    ],
  });
}

/** Sessionの現在の状態（idle/running等）を取得する。 */
export async function getSessionStatus(sessionId: string) {
  return client.beta.sessions.retrieve(sessionId);
}

/**
 * Sessionのevent履歴を古い順に取得する。Sync層（sync.ts）が未処理イベントを
 * 検出するために使う。件数が多いSessionでは自動ページングにより時間がかかりうるため、
 * 呼び出し側で必要に応じて上限を設けること。
 */
export async function listSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const events: SessionEvent[] = [];
  for await (const event of client.beta.sessions.events.list(sessionId, { order: "asc" })) {
    events.push(event);
  }
  return events;
}
