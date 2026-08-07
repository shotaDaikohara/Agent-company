import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { repo, deriveProjectState } from "../../lib/repo.js";
import { createProjectSession, sendUserMessage, interruptSession } from "../../managed-agents/session.js";
import { getOrCreateUserMemoryStore } from "../../managed-agents/memory.js";

const router = Router();

// Phase 1はシングルユーザー前提（db/init.ts で作成したデモユーザー固定）。
// Phase 2で認証ミドルウェアからuserIdを解決するよう差し替える。
const DEMO_USER_ID = "demo-user";

router.get("/", (req, res) => {
  const statusParam = req.query.status as string | undefined;
  const statuses = statusParam ? [statusParam] : ["active", "blocked", "completed"];
  const projects = repo.listProjects(DEMO_USER_ID, statuses);

  const result = projects.map((p) => {
    const tasks = repo.listTasks(p.id);
    const inProgress = tasks.find((t) => t.status === "in_progress");
    const waiting = tasks.find((t) => t.status === "waiting_confirmation");
    return {
      id: p.id,
      goal: p.goal,
      category: p.category,
      status: p.status,
      deadline: p.deadline,
      state: deriveProjectState(tasks),
      nextAction: (waiting ?? inProgress)?.title ?? null,
      updatedAt: p.updated_at,
    };
  });

  res.json({ projects: result });
});

const createProjectSchema = z.object({
  goal: z.string().min(1, "依頼内容を入力してください"),
});

router.post("/", async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: { code: "invalid_request", message: parsed.error.issues[0]?.message ?? "不正なリクエストです" },
    });
  }

  let sessionId: string;
  let agentId: string;
  try {
    const { loadManagedAgentsConfig } = await import("../../managed-agents/config.js");
    const config = loadManagedAgentsConfig();
    agentId = config.agentId;
    const memoryStoreId = await getOrCreateUserMemoryStore(DEMO_USER_ID);
    const created = await createProjectSession({
      goal: parsed.data.goal,
      memoryStoreIds: [memoryStoreId],
    });
    sessionId = created.sessionId;
  } catch (err) {
    // NG-A対策: Managed Agents側の作成に失敗した場合、Projectを「作成済み」として
    // 偽装しない。502を返し、クライアントには再試行を促す。
    console.error("[projects] Session作成に失敗:", err);
    return res.status(502).json({
      error: {
        code: "managed_agents_unavailable",
        message:
          "AIオーケストレーション基盤への接続に失敗しました（ANTHROPIC_API_KEY未設定、または `npm run agents:setup` 未実行の可能性があります）。",
      },
    });
  }

  const id = randomUUID();
  repo.insertProject({
    id,
    user_id: DEMO_USER_ID,
    goal: parsed.data.goal,
    category: null,
    status: "active",
    deadline: null,
    ma_agent_id: agentId,
    ma_session_id: sessionId,
    outcome_id: null,
  });

  res.status(201).json({ id, status: "active", maSessionId: sessionId });
});

router.get("/:id", (req, res) => {
  const project = repo.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Projectが見つかりません" } });
  }
  const tasks = repo.listTasks(project.id);
  const deps = repo.listDependencies(tasks.map((t) => t.id));

  res.json({
    id: project.id,
    goal: project.goal,
    category: project.category,
    status: project.status,
    deadline: project.deadline,
    state: deriveProjectState(tasks),
    tasks: tasks.map((t) => ({
      id: t.id,
      parentTaskId: t.parent_task_id,
      title: t.title,
      status: t.status,
      dueDate: t.due_date,
      dependsOn: deps.filter((d) => d.task_id === t.id).map((d) => d.depends_on_task_id),
    })),
  });
});

const messageSchema = z.object({ text: z.string().min(1) });

router.post("/:id/messages", async (req, res) => {
  const project = repo.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Projectが見つかりません" } });
  }
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_request", message: "textは必須です" } });
  }

  try {
    await sendUserMessage(project.ma_session_id, parsed.data.text);
  } catch (err) {
    console.error("[projects] メッセージ送信に失敗:", err);
    return res.status(502).json({
      error: { code: "managed_agents_unavailable", message: "メッセージの送信に失敗しました" },
    });
  }

  res.status(202).json({ accepted: true });
});

router.post("/:id/interrupt", async (req, res) => {
  const project = repo.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: "not_found", message: "Projectが見つかりません" } });
  }

  try {
    await interruptSession(project.ma_session_id);
  } catch (err) {
    console.error("[projects] 割り込みに失敗:", err);
    return res.status(502).json({
      error: { code: "managed_agents_unavailable", message: "割り込みに失敗しました" },
    });
  }

  res.status(202).json({ accepted: true });
});

export default router;
