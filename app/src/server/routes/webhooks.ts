import { Router } from "express";
import { client } from "../../managed-agents/client.js";
import { repo } from "../../lib/repo.js";
import { processSessionEvents } from "../../lib/sync.js";

const router = Router();

/**
 * Managed Agentsからの状態変化通知を受信する。
 * 署名検証（client.beta.webhooks.unwrap）を経て、該当ProjectのSync処理を起動する。
 * ANTHROPIC_WEBHOOK_SIGNING_KEY 環境変数が必要（未設定の場合は検証に失敗する）。
 *
 * 注意: このルートは生のリクエストボディ（express.raw）で受ける必要がある。
 * server/index.ts で express.json() より前にマウントすること。
 */
router.post("/", async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : String(req.body ?? "");

  let event;
  try {
    event = client.beta.webhooks.unwrap(rawBody, {
      headers: req.headers as Record<string, string>,
    });
  } catch (err) {
    console.error("[webhooks] 署名検証に失敗しました:", err);
    return res.status(400).json({
      error: { code: "invalid_signature", message: "Webhook署名の検証に失敗しました" },
    });
  }

  const sessionId = "id" in event.data ? event.data.id : undefined;
  if (sessionId) {
    const project = repo.getProjectBySessionId(sessionId);
    if (project) {
      try {
        const result = await processSessionEvents(project);
        console.log(
          `[webhooks] project=${project.id} type=${event.data.type} processed=${result.processedCount}`,
        );
      } catch (err) {
        console.error(`[webhooks] project=${project.id} のSync処理に失敗しました:`, err);
      }
    }
  }

  // 受信確認は常に2xxで返す（Anthropic側のリトライ仕様に従う）。
  res.status(204).end();
});

export default router;
