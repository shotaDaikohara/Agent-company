import { client } from "./client.js";
import { COORDINATOR_SYSTEM_PROMPT } from "./systemPrompt.js";
import { TASK_BOARD_TOOLS } from "./customTools.js";
import { configExists, configPath, saveManagedAgentsConfig } from "./config.js";

/**
 * Environment（実行サンドボックスのテンプレート）と Coordinator Agent を一度だけ作成する。
 *
 * 重要: この処理はリクエストパス（APIサーバーの起動のたび、Projectを作るたび）では
 * 絶対に呼び出さないこと。作成したIDは .managed-agents.json に保存し、以降はそのIDを
 * 参照する（claude-api skill: Managed Agents Common Pitfalls「Agent ONCE, not every run」）。
 *
 * 実行: npm run agents:setup
 */
async function main() {
  if (configExists()) {
    console.log(
      `[agents:setup] 既に ${configPath()} が存在します。再作成する場合は先にファイルを削除してください。`,
    );
    return;
  }

  console.log("[agents:setup] Environment を作成しています...");
  const environment = await client.beta.environments.create({
    name: "ai-cowork-dev",
    config: {
      type: "cloud",
      networking: { type: "unrestricted" },
    },
  });
  console.log(`[agents:setup] Environment作成完了: ${environment.id}`);

  console.log("[agents:setup] Coordinator Agent を作成しています...");
  const agent = await client.beta.agents.create({
    name: "AI Cowork Coordinator",
    model: "claude-opus-5",
    system: COORDINATOR_SYSTEM_PROMPT,
    tools: [
      // 標準ツールセット（bash/read/write/edit/glob/grep/web_fetch/web_search）。
      { type: "agent_toolset_20260401" },
      // Task DBへタスク状態を反映させるための自前ツール群（customTools.ts参照）。
      // execute_external_action は確認フロー(R-2, NG-B)の実体。
      ...TASK_BOARD_TOOLS,
      // 個々のMCPツールのpermission_policyは、MCPサーバー追加時（Phase 2以降）に調整する。
    ],
  });
  console.log(`[agents:setup] Agent作成完了: ${agent.id} (version=${agent.version})`);

  saveManagedAgentsConfig({
    environmentId: environment.id,
    agentId: agent.id,
    agentVersion: agent.version,
    createdAt: new Date().toISOString(),
  });

  console.log(`[agents:setup] 完了。設定を ${configPath()} に保存しました。`);
}

main().catch((err) => {
  console.error("[agents:setup] 失敗しました:", err);
  process.exit(1);
});
