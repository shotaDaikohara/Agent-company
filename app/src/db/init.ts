import fs from "node:fs";
import { db, schemaPath } from "./index.js";

/**
 * Task DB（SQLite開発版）を初期化する。
 * 実行: npm run db:init
 */
function main() {
  const sql = fs.readFileSync(schemaPath(), "utf-8");
  db.exec(sql);
  console.log("[db:init] スキーマを適用しました");

  // 開発用のデモユーザーを1件だけ用意する（未存在時のみ）。
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get("demo@example.com") as { id: string } | undefined;

  if (!existing) {
    db.prepare(
      `INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)`,
    ).run("demo-user", "demo@example.com", "デモユーザー");
    console.log("[db:init] デモユーザーを作成しました (id=demo-user)");
  } else {
    console.log("[db:init] デモユーザーは既に存在します");
  }
}

main();
