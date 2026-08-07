import "dotenv/config";
import express from "express";
import "../db/index.js"; // 起動時にDB接続を確立（未初期化なら npm run db:init を促す）
import projectsRouter from "./routes/projects.js";
import confirmationsRouter from "./routes/confirmations.js";
import notificationsRouter from "./routes/notifications.js";
import webhooksRouter from "./routes/webhooks.js";

const app = express();

// Webhook署名検証には生のリクエストボディが必要なため、express.json() より前に
// このルートだけ express.raw() でマウントする（順序が重要）。
app.use("/api/webhooks/managed-agents", express.raw({ type: "*/*" }), webhooksRouter);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-cowork-api", time: new Date().toISOString() });
});

app.use("/api/projects", projectsRouter);
app.use("/api/confirmations", confirmationsRouter);
app.use("/api/notifications", notificationsRouter);

app.use((req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "エンドポイントが見つかりません" } });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`[server] AI Cowork API を起動しました: http://localhost:${PORT}`);
});
