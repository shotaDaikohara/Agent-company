import "dotenv/config";
import { client } from "../src/managed-agents/client.js";
import { loadManagedAgentsConfig, saveManagedAgentsConfig } from "../src/managed-agents/config.js";

const config = loadManagedAgentsConfig();
const updated = await client.beta.agents.update(config.agentId, {
  version: config.agentVersion,
  model: "claude-haiku-4-5",
});

console.log("updated agent version:", updated.version, "model:", updated.model);

saveManagedAgentsConfig({
  ...config,
  agentVersion: updated.version,
});
console.log("config更新済み。以降の新規Projectはhaikuで動作します。");
