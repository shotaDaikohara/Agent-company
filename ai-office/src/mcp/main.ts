import express, { type Request, type Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createAiOfficeMcpServer } from "./createServer.js";
import { AI_OFFICE_VERSION } from "../version.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "127.0.0.1";
const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "ai-office", version: AI_OFFICE_VERSION });
});

app.post("/mcp", async (req: Request, res: Response) => {
  const { server, repo } = createAiOfficeMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  const cleanup = () => {
    void transport.close().catch(() => {});
    void server.close().catch(() => {});
    repo.close();
  };
  res.on("close", cleanup);

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP error", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).set("Allow", "POST").json({ error: "Method Not Allowed" });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).set("Allow", "POST").json({ error: "Method Not Allowed" });
});

app.listen(port, host, () => {
  console.log(`AI Office MCP server listening at http://${host}:${port}/mcp`);
});
