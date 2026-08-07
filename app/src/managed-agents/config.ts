import fs from "node:fs";
import path from "node:path";

export interface ManagedAgentsConfig {
  environmentId: string;
  agentId: string;
  agentVersion: number;
  createdAt: string;
}

const CONFIG_PATH = path.join(process.cwd(), ".managed-agents.json");

/**
 * `npm run agents:setup` で一度だけ作成される Agent / Environment のIDを読み込む。
 * agents.create() / environments.create() をリクエストパスで毎回呼ばないための仕組み
 * （claude-api skill: Managed Agents Common Pitfalls 参照）。
 */
export function loadManagedAgentsConfig(): ManagedAgentsConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `${CONFIG_PATH} が見つかりません。先に \`npm run agents:setup\` を実行してください。`,
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as ManagedAgentsConfig;
}

export function saveManagedAgentsConfig(config: ManagedAgentsConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export function configExists(): boolean {
  return fs.existsSync(CONFIG_PATH);
}

export function configPath(): string {
  return CONFIG_PATH;
}
