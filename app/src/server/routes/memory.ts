import { Router } from "express";
import { db } from "../../db/index.js";
import { listUserMemoryEntries } from "../../managed-agents/memoryView.js";

const router = Router();

// Phase 1はシングルユーザー前提（routes/projects.tsと同じ方針）。
const DEMO_USER_ID = "demo-user";

/**
 * ユーザースコープのMemory Store内容を一覧する（UC-18・R-9対応の閲覧機能）。
 * まだ何もProjectを作っていない等でMemory Storeが未作成の場合は空配列を返す。
 */
router.get("/", async (_req, res) => {
  const user = db
    .prepare(`SELECT memory_store_id FROM users WHERE id = ?`)
    .get(DEMO_USER_ID) as { memory_store_id: string | null } | undefined;

  if (!user?.memory_store_id) {
    return res.json({ entries: [] });
  }

  try {
    const entries = await listUserMemoryEntries(user.memory_store_id);
    res.json({ entries });
  } catch (err) {
    console.error("[memory] 取得に失敗:", err);
    res.status(502).json({
      error: { code: "managed_agents_unavailable", message: "記憶の取得に失敗しました" },
    });
  }
});

export default router;
