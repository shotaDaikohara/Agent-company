import "dotenv/config";
import express from "express";
import "../db/index.js"; // 起動時にDB接続を確立（未初期化なら npm run db:init を促す）
import projectsRouter from "./routes/projects.js";
import confirmationsRouter from "./routes/confirmations.js";
import notificationsRouter from "./routes/notifications.js";

const app = express();
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "ai-cowork-api", time: new Date().toISOString() });
});

app.use("/api/projects", projectsRouter);
app.use("/api/confirmations", confirmationsRouter);
app.use("/api/notifications", notificationsRouter);

// Webhook受信は Phase 2 で実装（Sync層: docs/technical-design.md 2.9 参照）。
app.post("/api/webhooks/managed-agents", (_req, res) => {
  res.status(501).json({
    error: { code: "not_implemented", message: "Webhook受信は Phase 2 で実装予定です" },
  });
});

app.use((req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "エンドポイントが見つかりません" } });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`[server] AI Cowork API を起動しました: http://localhost:${PORT}`);
});
