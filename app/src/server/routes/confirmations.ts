import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { repo } from "../../lib/repo.js";
import { respondToolConfirmation, respondCustomToolResult } from "../../managed-agents/session.js";

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
    return res
      .status(400)
      .json({ error: { code: "invalid_request", message: "resultは allow/deny のいずれかです" } });
  }

  const task = repo.getTask(confirmation.task_id);
  const project = task ? repo.getProject(task.project_id) : undefined;
  if (!task || !project) {
    return res.status(404).json({
      error: { code: "not_found", message: "確認事項に対応するProjectが見つかりません" },
    });
  }

  const approved = parsed.data.result === "allow";

  try {
    if (confirmation.ma_tool_kind === "native") {
      // agent_toolset/MCPツールの permission_policy: always_ask への応答。
      await respondToolConfirmation(
        project.ma_session_id,
        confirmation.ma_tool_use_event_id,
        parsed.data.result,
        parsed.data.message,
      );
    } else {
      // 自前の execute_external_action への応答。承認された場合、実際の外部連携が
      // まだ実装されていない段階では「模擬実行」として証跡を残す（NG-A対策として、
      // UI上は模擬である旨を明示すること — docs/technical-design.md 2.9参照）。
      const resultText = approved
        ? JSON.stringify({ executed: true, mocked: true, note: "外部連携未実装のため模擬実行" })
        : JSON.stringify({ executed: false, reason: parsed.data.message ?? "ユーザーが却下しました" });
      await respondCustomToolResult(project.ma_session_id, confirmation.ma_tool_use_event_id, resultText);
    }
  } catch (err) {
    console.error("[confirmations] 応答の送信に失敗:", err);
    return res.status(502).json({
      error: { code: "managed_agents_unavailable", message: "確認応答の送信に失敗しました" },
    });
  }

  repo.resolveConfirmation(confirmation.id, approved ? "approved" : "rejected");

  if (confirmation.ma_tool_kind === "custom") {
    if (approved) {
      repo.insertExternalActionLog({
        id: randomUUID(),
        confirmation_request_id: confirmation.id,
        executed_at: new Date().toISOString(),
        result: "success",
        evidence: "模擬実行（外部連携はPhase 2以降で実装）",
      });
      repo.updateTaskStatus(task.id, "done");
    } else {
      repo.updateTaskStatus(task.id, "pending");
    }
  }

  res.json({ ...confirmation, status: approved ? "approved" : "rejected" });
});

export default router;
