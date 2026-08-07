-- AI Cowork — Task DB スキーマ（SQLite / ローカル開発用）
--
-- 本番は ../../../db/schema.sql（PostgreSQL）を正とする。
-- このファイルはPhase 1をDBサーバーなしですぐ動かすための開発用の等価スキーマ。
-- UUIDはTEXT、TIMESTAMPTZはISO8601文字列のTEXTとして扱う。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id                  TEXT PRIMARY KEY,
    email               TEXT NOT NULL UNIQUE,
    display_name        TEXT,
    vault_id            TEXT,
    -- ユーザースコープのMemory Store（初回Project作成時に遅延作成、以降再利用）
    memory_store_id     TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal            TEXT NOT NULL,
    category        TEXT,
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'blocked', 'completed', 'cancelled')),
    deadline        TEXT,
    ma_agent_id     TEXT NOT NULL,
    ma_session_id   TEXT NOT NULL UNIQUE,
    outcome_id      TEXT,
    -- Sync層が最後に処理したSession event ID（events.list の重複処理防止用カーソル）
    last_synced_event_id TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_user_status ON projects(user_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_deadline ON projects(deadline);

CREATE TABLE IF NOT EXISTS tasks (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id  TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending', 'in_progress', 'waiting_confirmation', 'blocked', 'done'
                        )),
    due_date        TEXT,
    source          TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'user')),
    ma_event_id     TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);

CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id             TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id  TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE IF NOT EXISTS memory_entries (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT REFERENCES users(id) ON DELETE CASCADE,
    project_id          TEXT REFERENCES projects(id) ON DELETE CASCADE,
    key                 TEXT NOT NULL,
    value               TEXT NOT NULL,
    evidence_type       TEXT NOT NULL DEFAULT 'unconfirmed'
                            CHECK (evidence_type IN (
                                'confirmed_fact', 'official_info', 'inferred', 'unconfirmed'
                            )),
    ma_memory_store_id  TEXT NOT NULL,
    ma_memory_id        TEXT NOT NULL,
    valid_until         TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    CHECK (
        (user_id IS NOT NULL AND project_id IS NULL) OR
        (user_id IS NULL AND project_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_memory_user ON memory_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_project ON memory_entries(project_id);

CREATE TABLE IF NOT EXISTS confirmation_requests (
    id                      TEXT PRIMARY KEY,
    task_id                 TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reason                  TEXT NOT NULL CHECK (reason IN ('irreversible', 'high_risk', 'value_judgment')),
    proposed_action         TEXT NOT NULL,
    risk_detail             TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
    ma_tool_use_event_id    TEXT NOT NULL,
    -- 応答方法の分岐: 'native' = user.tool_confirmation（agent_toolset/MCPの always_ask）
    --               'custom' = user.custom_tool_result（自前のexecute_external_actionツール）
    ma_tool_kind             TEXT NOT NULL DEFAULT 'custom' CHECK (ma_tool_kind IN ('native', 'custom')),
    created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    resolved_at             TEXT
);

CREATE INDEX IF NOT EXISTS idx_confirmation_status ON confirmation_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_confirmation_task_pending
    ON confirmation_requests(task_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS external_action_logs (
    id                          TEXT PRIMARY KEY,
    confirmation_request_id     TEXT NOT NULL REFERENCES confirmation_requests(id) ON DELETE CASCADE,
    executed_at                 TEXT NOT NULL,
    result                      TEXT NOT NULL CHECK (result IN ('success', 'failure')),
    evidence                    TEXT,
    created_at                  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_external_action_confirmation ON external_action_logs(confirmation_request_id);

CREATE TABLE IF NOT EXISTS notifications (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('discovery', 'plan_change', 'problem', 'confirmation', 'completion')),
    title           TEXT NOT NULL,
    body            TEXT,
    triggered_by    TEXT,
    read_at         TEXT,
    created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id, created_at DESC);
