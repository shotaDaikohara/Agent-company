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
