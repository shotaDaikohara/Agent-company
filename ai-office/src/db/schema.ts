export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  request TEXT NOT NULL,
  goal TEXT NOT NULL,
  completion_criteria_json TEXT NOT NULL,
  priority TEXT NOT NULL,
  status TEXT NOT NULL,
  plan_version INTEGER NOT NULL DEFAULT 1,
  final_output TEXT,
  completion_evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subtasks (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  type TEXT NOT NULL,
  instruction TEXT NOT NULL,
  depends_on_json TEXT NOT NULL,
  status TEXT NOT NULL,
  output TEXT,
  plan_version INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  reused_in_plan_version INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_job_id ON subtasks(job_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_job_plan ON subtasks(job_id, plan_version);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  subtask_id TEXT REFERENCES subtasks(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_job_id ON events(job_id, created_at);
`;
