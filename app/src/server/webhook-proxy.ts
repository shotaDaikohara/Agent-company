import "dotenv/config";
import express from "express";

/**
 * Webhook専用の外部公開プロキシ。
 *
 * ngrok等で外部公開するのはこのプロセスのポートだけにする。メインAPI（server/index.ts,
 * :3001）は /api/projects や /api/confirmations/:id/respond など無認証のエンドポイントを
 * 多く持つため、まるごと公開するとProjectの無断作成・確認の無断承認/却下が可能になって
 * しまう。このプロキシは POST /api/webhooks/managed-agents 以外は一切受け付けず、それも
 * 署名検証はメインAPI側（client.beta.webhooks.unwrap）でそのまま行われる — 生のボディと
 * ヘッダーを変更せず転送するだけなので、検証の正しさは損なわれない。
 */

const TARGET = process.env.WEBHOOK_TARGET ?? "http://localhost:3001";
const PORT = Number(process.env.WEBHOOK_PROXY_PORT ?? 3002);

const app = express();

app.post(
  "/api/webhooks/managed-agents",
  express.raw({ type: "*/*" }),
  async (req, res) => {
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") headers[key] = value;
    }
    delete headers.host;
    delete headers["content-length"];

    try {
      const upstream = await fetch(`${TARGET}/api/webhooks/managed-agents`, {
        method: "POST",
        headers,
        body: req.body,
      });
      const text = await upstream.text();
      res.status(upstream.status).send(text);
    } catch (err) {
      console.error("[webhook-proxy] 転送に失敗:", err);
      res.status(502).send("bad gateway");
    }
  },
);

// このパス以外は一切受け付けない — 外部公開面をWebhook1本に限定する
app.use((_req, res) => {
  res.status(404).send("not found");
});

app.listen(PORT, () => {
  console.log(`[webhook-proxy] :${PORT} で待受中（転送先: ${TARGET}）`);
});
