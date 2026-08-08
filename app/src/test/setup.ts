import fs from "node:fs";
import { db, schemaPath } from "../db/index.js";

/**
 * テストファイルごと（vitestのisolateにより独立したモジュールレジストリ = 独立した
 * ":memory:" DB）に、本番と同じ schema.sqlite.sql を適用し、db:init と同じ
 * デモユーザーを1件用意する。npm run db:init の実体（src/db/init.ts）と重複するが、
 * CLIスクリプトをテストから直接importするより、setupFilesとして独立させたほうが安全。
 */
const sql = fs.readFileSync(schemaPath(), "utf-8");
db.exec(sql);

const existing = db.prepare("SELECT id FROM users WHERE id = ?").get("demo-user");
if (!existing) {
  db.prepare(`INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)`).run(
    "demo-user",
    "demo@example.com",
    "テストユーザー",
  );
}
