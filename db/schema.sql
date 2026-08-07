-- AI Cowork — Task DB スキーマ（PostgreSQL）
--
-- 位置づけ: docs/technical-design.md 3章の論理データモデルに対応する物理スキーマ。
-- 実体（会話・記憶・確認フロー）はClaude Managed Agents側（Session / Memory Store）に
-- あり、本DBはダッシュボード表示・依存関係管理・監査用にそれを投影したビューを保持する
-- （設計判断は technical-design.md 2.5 / 2.9 を参照）。
--
-- 開発時はローカルでPostgresを用意する代わりに better-sqlite3 で近い形の
-- スキーマを使う（app/src/db/init.ts）。本番はこのファイルを正とする。

BEGIN;

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    display_name    TEXT,
    -- Managed Agentsの認証情報(Vault)への参照。Vault自体はAnthropic側で secret を保持し、
    -- ここにはIDのみを持つ。
    vault_id        TEXT,
    -- ユーザースコープのMemory Store（初回Project作成時に遅延作成、以降再利用）
    memory_store_id TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- projects
--   基本設計 R-1（タスク中心管理）の単位。Managed Agentsの1 Sessionに対応する。
-- ============================================================
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal            TEXT NOT NULL,                 -- 最終目的（例:「11月末までに引っ越し完了」）
    category        TEXT,                          -- ダッシュボード表示用（旅行/住まい/手続き/家庭 等）
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'blocked', 'completed', 'cancelled')),
    deadline        DATE,
    -- Managed Agents側の参照
    ma_agent_id     TEXT NOT NULL,                 -- 使用しているAgentのID（Coordinator）
    ma_session_id   TEXT NOT NULL UNIQUE,           -- このProjectに対応するSessionのID
    outcome_id      TEXT,                           -- Outcomeを使う場合の user.define_outcome の outcome_id
    last_synced_event_id TEXT,                      -- Sync層のカーソル（events.list重複処理防止）
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_user_status ON projects(user_id, status);
CREATE INDEX idx_projects_deadline ON projects(deadline) WHERE deadline IS NOT NULL;

-- ============================================================
-- tasks（Session内の作業をUI表示用に構造化したツリー）
-- ============================================================
CREATE TABLE tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_task_id  UUID REFERENCES tasks(id) ON DELETE CASCADE,  -- 自己参照で木構造
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending', 'in_progress', 'waiting_confirmation', 'blocked', 'done'
                        )),
    due_date        DATE,
    source          TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'user')),
    -- どのSession event（agent.tool_use等）に由来するタスクかの参照（監査・デバッグ用）
    ma_event_id     TEXT,
    -- 実行結果の要約（update_task_statusのresult引数）。ユーザーが「何が実行されたか」を後から確認できるようにする。
    result          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX idx_tasks_status ON tasks(project_id, status);

-- 依存関係（多対多）。SC-02「新居契約前に退去通知を出さない」等の前後関係制御に使う。
CREATE TABLE task_dependencies (
    task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id  UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, depends_on_task_id),
    CHECK (task_id <> depends_on_task_id)
);

-- ============================================================
-- memory_entries
--   実体はManaged Agents Memory Store。ここには検索・表示用メタデータのみを複写する。
-- ============================================================
CREATE TABLE memory_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    project_id      UUID REFERENCES projects(id) ON DELETE CASCADE,
    -- scope = user | project のいずれか一方のみ設定
    CHECK (
        (user_id IS NOT NULL AND project_id IS NULL) OR
        (user_id IS NULL AND project_id IS NOT NULL)
    ),
    key             TEXT NOT NULL,
    value           TEXT NOT NULL,
    evidence_type   TEXT NOT NULL DEFAULT 'unconfirmed'
                        CHECK (evidence_type IN (
                            'confirmed_fact', 'official_info', 'inferred', 'unconfirmed'
                        )),
    -- Managed Agents Memory Store側の実体への参照
    ma_memory_store_id TEXT NOT NULL,
    ma_memory_id        TEXT NOT NULL,
    valid_until     DATE,                          -- 陳腐化した情報の再確認に利用
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_user ON memory_entries(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_memory_project ON memory_entries(project_id) WHERE project_id IS NOT NULL;

-- ============================================================
-- confirmation_requests
--   実体は Session の agent.tool_use(evaluated_permission="ask") 〜 user.tool_confirmation。
--   Sync層がここへ投影する（technical-design.md 2.9）。
-- ============================================================
CREATE TABLE confirmation_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    reason              TEXT NOT NULL CHECK (reason IN ('irreversible', 'high_risk', 'value_judgment')),
    proposed_action     TEXT NOT NULL,              -- 内容の要約（ユーザー提示用）
    risk_detail         TEXT,                       -- 金額・キャンセル条件等
    status              TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected')),
    -- Managed AgentsのSession event ID（agent.tool_use / user.tool_confirmation）
    ma_tool_use_event_id TEXT NOT NULL,
    -- 'native' = user.tool_confirmation（agent_toolset/MCPのalways_ask）
    -- 'custom' = user.custom_tool_result（自前のexecute_external_actionツール）
    ma_tool_kind         TEXT NOT NULL DEFAULT 'custom' CHECK (ma_tool_kind IN ('native', 'custom')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_confirmation_status ON confirmation_requests(status);
CREATE UNIQUE INDEX idx_confirmation_task ON confirmation_requests(task_id)
    WHERE status = 'pending';  -- 1タスクにつき確認待ちは同時に1件まで（NG-C対策）

-- ============================================================
-- external_action_logs
--   NG-A（虚偽の完了報告）対策の実行証跡。
-- ============================================================
CREATE TABLE external_action_logs (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    confirmation_request_id UUID NOT NULL REFERENCES confirmation_requests(id) ON DELETE CASCADE,
    executed_at             TIMESTAMPTZ NOT NULL,
    result                  TEXT NOT NULL CHECK (result IN ('success', 'failure')),
    evidence                TEXT,                   -- 予約番号・送信ID等
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_external_action_confirmation ON external_action_logs(confirmation_request_id);

-- ============================================================
-- notifications
--   R-4: 状態変化時のみ発火（Sync層がWebhookから生成）。
-- ============================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type            TEXT NOT NULL CHECK (type IN ('discovery', 'plan_change', 'problem', 'confirmation', 'completion')),
    title           TEXT NOT NULL,
    body            TEXT,
    triggered_by    TEXT,                           -- 元になったSession event ID等
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_project ON notifications(project_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(project_id) WHERE read_at IS NULL;

COMMIT;
