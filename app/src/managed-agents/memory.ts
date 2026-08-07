import { client } from "./client.js";
import { db } from "../db/index.js";

/**
 * ユーザースコープのMemory Storeを取得する。存在しなければ作成する（初回Project作成時に
 * 遅延作成し、以降は再利用する）。R-6（長期記憶）対応 — technical-design.md 2.6参照。
 */
export async function getOrCreateUserMemoryStore(userId: string): Promise<string> {
  const user = db
    .prepare(`SELECT memory_store_id FROM users WHERE id = ?`)
    .get(userId) as { memory_store_id: string | null } | undefined;

  if (user?.memory_store_id) {
    return user.memory_store_id;
  }

  const store = await client.beta.memoryStores.create({
    name: `user-${userId}`,
    description:
      "ユーザーの基本情報（居住地・家族構成・選好等）と、過去Projectで確定した事実。" +
      "既知の情報をユーザーへ再質問しないために、Project開始時に必ず確認すること。",
  });

  db.prepare(`UPDATE users SET memory_store_id = ? WHERE id = ?`).run(store.id, userId);
  return store.id;
}
