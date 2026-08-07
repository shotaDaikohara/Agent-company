import { Router } from "express";
import { z } from "zod";
import { repo } from "../../lib/repo.js";
import { respondToolConfirmation } from "../../managed-agents/session.js";

const router = Router();

router.get("/", (req, res) => {
  const status = req.query.status as string | undefined;
  res.json({ confirmations: repo.listConfirmations(status) });
});

router.get("/:id", (req, res) => {
  const confirmation = repo.getConfirmation(req.params.id);
  if (!confirmation) {
    return res.status(404).json({ error: { code: "not_found", message: "確認事項が見つかりません" } });
  }
  res.json(confirmation);
});

const respondSchema = z.object({
  result: z.enum(["allow", "deny"]),
  message: z.string().optional(),
});

router.post("/:id/respond", async (req, res) => {
  const confirmation = repo.getConfirmation(req.params.id);
  if (!confirmation) {
    return res.status(404).json({ error: { code: "not_found", message: "確認事項が見つかりません" } });
  }
  if (confirmation.status !== "pending") {
    return res.status(409).json({
      error: { code: "confirmation_not_pending", message: "この確認は既に処理済みです" },
    });
  }

  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: "invalid_request", message: "resultは allow/deny のいずれかです" } });
  }

  const task = repo.getTask(confirmation.task_id);
  const project = task ? repo.getProject(task.project_id) : undefined;
  if (!task || !project) {
    return res.status(404).json({
      error: { code: "not_found", message: "確認事項に対応するProjectが見つかりません" },
    });
  }

  try {
    await respondToolConfirmation(
      project.ma_session_id,
      confirmation.ma_tool_use_event_id,
      parsed.data.result,
      parsed.data.message,
    );
  } catch (err) {
    console.error("[confirmations] 応答の送信に失敗:", err);
    return res.status(502).json({
      error: { code: "managed_agents_unavailable", message: "確認応答の送信に失敗しました" },
    });
  }

  repo.resolveConfirmation(confirmation.id, parsed.data.result === "allow" ? "approved" : "rejected");
  res.json({ ...confirmation, status: parsed.data.result === "allow" ? "approved" : "rejected" });
});

export default router;
