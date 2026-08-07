import "dotenv/config";
import { client } from "../src/managed-agents/client.js";
import { loadManagedAgentsConfig, saveManagedAgentsConfig } from "../src/managed-agents/config.js";
import { COORDINATOR_SYSTEM_PROMPT } from "../src/managed-agents/systemPrompt.js";
import { TASK_BOARD_TOOLS } from "../src/managed-agents/customTools.js";

// customTools.ts / systemPrompt.ts はコード変更しただけでは既存のCoordinator Agentへ反映されない
// （Managed Agentsの仕様上、AgentはIDに紐づくスナップショット）。このスクリプトで既存Agentを
// 新しいtools/system定義で更新する。update-model.mjsと同じパターン。
// 実行: npm run agents:update-tools

const config = loadManagedAgentsConfig();
const updated = await client.beta.agents.update(config.agentId, {
  version: config.agentVersion,
  system: COORDINATOR_SYSTEM_PROMPT,
  tools: [{ type: "agent_toolset_20260401" }, ...TASK_BOARD_TOOLS],
});

console.log("updated agent version:", updated.version);

saveManagedAgentsConfig({
  ...config,
  agentVersion: updated.version,
});
console.log("config更新済み。以降の新規Projectはresult引数つきのupdate_task_statusで動作します。");
