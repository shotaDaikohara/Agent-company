import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// リポジトリ直下の data/ 配下にSQLiteファイルを置く（.gitignore対象）。
// 本番はPostgres（../../../db/schema.sql）に差し替える想定 — technical-design.md 7章参照。
const DATA_DIR = path.join(here, "..", "..", "data");
const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "ai-cowork.sqlite");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function schemaPath(): string {
  return path.join(here, "schema.sqlite.sql");
}

/**
 * `schema.sqlite.sql` は `CREATE TABLE IF NOT EXISTS` のため、既存DBに後から列を
 * 追加した場合は再適用しても列が増えない。開発用DBを壊さず追従させるための
 * 最小限の自己修復マイグレーション。新しい列を追加した際はここにも追記する。
 */
function migrate(): void {
  const tableExists = (table: string): boolean =>
    db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table) !== undefined;

  const ensureColumn = (table: string, column: string, ddl: string): void => {
    if (!tableExists(table)) return;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!columns.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  };

  ensureColumn("tasks", "result", "result TEXT");
}

migrate();
