import "dotenv/config";
import { client } from "../src/managed-agents/client.js";
const sessionId = process.argv[2];
for await (const e of client.beta.sessions.events.list(sessionId, { order: "asc" })) {
  if (e.type === "agent.message") {
    for (const b of e.content) if (b.type === "text") console.log("[agent]", b.text);
  }
}
