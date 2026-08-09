import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { Repository } from "../db/repository.js";
import { AiOfficeService } from "../tools/service.js";
import { currentJobContext } from "../tools/presenters.js";
import { AI_OFFICE_VERSION } from "../version.js";

const DASHBOARD_URI = "ui://ai-office/dashboard-v1.html";

const subtaskInputSchema = z.object({
  key: z.string().min(1).max(64),
  type: z.enum(["RESEARCH", "CREATE", "REVIEW", "ACTION"]),
  instruction: z.string().min(1),
  dependsOnKeys: z.array(z.string()).optional(),
});

function textResult(message: string, structuredContent: Record<string, unknown>) {
  return {
    structuredContent,
    content: [{ type: "text" as const, text: message }],
  };
}

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createAiOfficeMcpServer(dbPath = process.env.AI_OFFICE_DB ?? "./data/ai-office.sqlite") {
  const repo = new Repository(dbPath);
  const service = new AiOfficeService(repo);
  const server = new McpServer(
    { name: "ai-office", version: AI_OFFICE_VERSION },
    {
      instructions:
        "Use AI Office for multi-step or persistent work. Keep independent goals as separate Jobs. Before changing an existing Job, retrieve it. Treat RESEARCH/CREATE/REVIEW/ACTION as logical stages performed by this ChatGPT, not background agents. Never mark external actions complete without evidence.",
    },
  );

  server.registerTool(
    "create_job",
    {
      title: "Create AI Office job",
      description:
        "Create a persistent Job for a new multi-step goal. Do not use for simple one-shot questions or for changes to an existing Job.",
      inputSchema: {
        title: z.string().min(1),
        request: z.string().min(1),
        goal: z.string().min(1),
        completionCriteria: z.array(z.string().min(1)).min(1),
        priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
        subtasks: z.array(subtaskInputSchema).optional(),
      },
      outputSchema: { context: z.unknown() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
      _meta: {
        "openai/toolInvocation/invoking": "案件を登録しています…",
        "openai/toolInvocation/invoked": "案件を登録しました。",
      },
    },
    async (input) => {
      try {
        const detail = service.createJob({
          title: input.title,
          request: input.request,
          goal: input.goal,
          completionCriteria: input.completionCriteria,
          priority: input.priority,
          subtasks: input.subtasks,
        });
        return textResult(`Created job: ${detail.job.title}`, { context: currentJobContext(detail) });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "list_jobs",
    {
      title: "List AI Office jobs",
      description: "List persistent jobs. Use this to locate a Job before updating it or to compare priorities and states.",
      inputSchema: {
        status: z.enum(["IN_PROGRESS", "WAITING_USER", "COMPLETED", "FAILED", "CANCELED"]).optional(),
        priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
      },
      outputSchema: { jobs: z.array(z.unknown()) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        const jobs = service.listJobs(input);
        return textResult(`Found ${jobs.length} jobs.`, { jobs });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "get_job",
    {
      title: "Get AI Office job",
      description: "Retrieve the current plan, explicitly reused prior outputs, and recent history for one Job before changing or continuing it.",
      inputSchema: { jobId: z.string().uuid() },
      outputSchema: { context: z.unknown() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ jobId }) => {
      try {
        const detail = service.getJob(jobId);
        return textResult(`Loaded job: ${detail.job.title}`, { context: currentJobContext(detail) });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "update_job",
    {
      title: "Update AI Office job",
      description: "Make a small change to an existing Job without replacing its plan. Use replace_plan for a change that invalidates current subtasks.",
      inputSchema: {
        jobId: z.string().uuid(),
        title: z.string().min(1).optional(),
        goal: z.string().min(1).optional(),
        completionCriteria: z.array(z.string().min(1)).min(1).optional(),
      },
      outputSchema: { context: z.unknown() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ jobId, ...patch }) => {
      try {
        const detail = service.updateJob(jobId, patch);
        return textResult(`Updated job: ${detail.job.title}`, { context: currentJobContext(detail) });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "replace_plan",
    {
      title: "Replace AI Office job plan",
      description:
        "Replace the active plan after a material direction change. This increments plan_version and prevents obsolete outputs from entering the latest result unless explicitly reused.",
      inputSchema: {
        jobId: z.string().uuid(),
        goal: z.string().min(1).optional(),
        completionCriteria: z.array(z.string().min(1)).min(1).optional(),
        subtasks: z.array(subtaskInputSchema).min(1),
        reuseSubtaskIds: z.array(z.string().uuid()).optional(),
      },
      outputSchema: { context: z.unknown() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ jobId, ...input }) => {
      try {
        const detail = service.replacePlan(jobId, input);
        return textResult(`Replaced plan for: ${detail.job.title}`, { context: currentJobContext(detail) });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "update_subtask",
    {
      title: "Update AI Office subtask",
      description:
        "Update a subtask state or save its output. WAITING_USER requires waitingReason. When resolving WAITING_USER, pass the user's explicit reply in userInput. Current-plan CANCELED is not allowed; use replace_plan for obsolete work.",
      inputSchema: {
        subtaskId: z.string().uuid(),
        status: z.enum(["TODO", "IN_PROGRESS", "WAITING_USER", "DONE", "FAILED"]).optional(),
        output: z.string().nullable().optional(),
        waitingReason: z.string().min(1).optional(),
        userInput: z.string().min(1).optional(),
      },
      outputSchema: { subtask: z.unknown(), context: z.unknown() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ subtaskId, ...patch }) => {
      try {
        const subtask = service.updateSubtask(subtaskId, patch);
        const detail = service.getJob(subtask.jobId);
        return textResult(`Updated ${subtask.type} subtask.`, { subtask, context: currentJobContext(detail) });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "change_priority",
    {
      title: "Change AI Office job priority",
      description: "Change a Job's priority. Priority guides what ChatGPT should work on next; it does not schedule background workers.",
      inputSchema: { jobId: z.string().uuid(), priority: z.enum(["HIGH", "NORMAL", "LOW"]) },
      outputSchema: { context: z.unknown(), dashboard: z.array(z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ jobId, priority }) => {
      try {
        const detail = service.changePriority(jobId, priority);
        return textResult(`Priority changed to ${priority}.`, { context: currentJobContext(detail), dashboard: service.getDashboard() });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "cancel_job",
    {
      title: "Cancel AI Office job",
      description: "Cancel a Job while preserving its history and completed outputs. Use only when the user wants the whole Job stopped.",
      inputSchema: { jobId: z.string().uuid() },
      outputSchema: { context: z.unknown(), dashboard: z.array(z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ jobId }) => {
      try {
        const detail = service.cancelJob(jobId);
        return textResult(`Canceled job: ${detail.job.title}`, { context: currentJobContext(detail), dashboard: service.getDashboard() });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "complete_job",
    {
      title: "Complete AI Office job",
      description:
        "Complete a Job only after every current-plan subtask is DONE. Each completion criterion must cite effective DONE source subtasks with stored output. ACTION evidence also requires recorded user input/execution confirmation.",
      inputSchema: {
        jobId: z.string().uuid(),
        finalOutput: z.string().min(1),
        completionEvidence: z.array(z.object({
          criterion: z.string().min(1),
          evidence: z.string().min(1),
          sourceSubtaskIds: z.array(z.string().uuid()).min(1),
        })).min(1),
      },
      outputSchema: { context: z.unknown(), dashboard: z.array(z.unknown()) },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ jobId, finalOutput, completionEvidence }) => {
      try {
        const detail = service.completeJob(jobId, finalOutput, completionEvidence);
        return textResult(`Completed job: ${detail.job.title}`, { context: currentJobContext(detail), dashboard: service.getDashboard() });
      } catch (error) { return toolError(error); }
    },
  );

  server.registerTool(
    "get_dashboard",
    {
      title: "Get AI Office dashboard data",
      description: "Return compact dashboard data for all Jobs without rendering UI.",
      inputSchema: {},
      outputSchema: { dashboard: z.array(z.unknown()) },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async () => textResult("Loaded AI Office dashboard data.", { dashboard: service.getDashboard() }),
  );

  server.registerTool(
    "render_dashboard",
    {
      title: "Show AI Office",
      description: "Render the AI Office visual dashboard. Use after relevant job updates when the user wants to see or manage their office.",
      inputSchema: { selectedJobId: z.string().uuid().optional() },
      outputSchema: { dashboard: z.array(z.unknown()), selected: z.unknown().nullable() },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: {
        ui: { resourceUri: DASHBOARD_URI },
        "openai/outputTemplate": DASHBOARD_URI,
        "openai/toolInvocation/invoking": "オフィスを開いています…",
        "openai/toolInvocation/invoked": "オフィスを表示しました。",
      },
    },
    async ({ selectedJobId }) => {
      try {
        const dashboard = service.getDashboard();
        const selectedId = selectedJobId ?? dashboard[0]?.id;
        const selected = selectedId ? currentJobContext(service.getJob(selectedId)) : null;
        return textResult("Rendered AI Office dashboard.", { dashboard, selected });
      } catch (error) { return toolError(error); }
    },
  );

  const componentPath = resolve(process.cwd(), "web/dist/component.js");
  registerAppResource(server, "ai-office-dashboard", DASHBOARD_URI, {}, async () => {
    const component = readFileSync(componentPath, "utf8");
    return {
      contents: [
        {
          uri: DASHBOARD_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: `<div id="root"></div><script type="module">${component}</script>`,
          _meta: { ui: { prefersBorder: false } },
        },
      ],
    };
  });

  return { server, repo };
}
