import "dotenv/config";
import { client } from "../src/managed-agents/client.js";

const sessionId = process.argv[2];
const session = await client.beta.sessions.retrieve(sessionId);
console.log("status:", session.status);

const events = [];
for await (const e of client.beta.sessions.events.list(sessionId, { order: "asc" })) {
  events.push(e);
}
console.log("event count:", events.length);
for (const e of events) {
  console.log("-", e.type, "id" in e ? e.id : "", "name" in e ? e.name : "");
}
