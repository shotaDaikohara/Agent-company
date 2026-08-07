import "dotenv/config";
import { repo } from "../src/lib/repo.js";
import { processSessionEvents } from "../src/lib/sync.js";

const sessionId = process.argv[2];
const project = repo.getProjectBySessionId(sessionId);
if (!project) {
  console.error("project not found for session", sessionId);
  process.exit(1);
}

const result = await processSessionEvents(project);
console.log("processed:", result.processedCount, "notifications:", result.notifications);

console.log("--- tasks ---");
for (const t of repo.listTasks(project.id)) {
  console.log(t.status, t.title, t.id);
}
