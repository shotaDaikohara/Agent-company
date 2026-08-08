import { createServer } from "node:http";
import { Repository } from "./db/repository.js";
import { AiOfficeService } from "./tools/service.js";

const repo = new Repository(process.env.AI_OFFICE_DB ?? "./data/ai-office.sqlite");
const service = new AiOfficeService(repo);
const port = Number(process.env.PORT ?? 3000);

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/debug/dashboard") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(service.getDashboard(), null, 2));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(port, () => console.log(`AI Office core dev server: http://localhost:${port}`));
