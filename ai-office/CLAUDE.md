# AI Office MVP - Claude Code handoff

## Read first

Authoritative design:
- AI Office 基本設計: https://docs.google.com/document/d/1yfQgVhgbjxaLJ2dCeG3l4Rvo8ENhCrro_KmfGC4uuuo/edit
- 実装タスク管理: https://docs.google.com/document/d/1AvTAXFux1mmzCHDQELIq2hlo6cw2ODhLQbTSuCDuEGI/edit
- テストシナリオ: https://docs.google.com/document/d/1BV96PWX_4oW1L2J-ifbCDooyNHy2ooNcIhSCwFM5r-o/edit

The basic design overrides older assumptions in the test-scenario document where the Pure Plugin MVP scope differs.

## Non-negotiable MVP architecture

- One ChatGPT performs MANAGER / RESEARCH / CREATE / REVIEW logically.
- Do not add an OpenAI/Anthropic LLM API call to the AI Office backend.
- Do not add Worker Agents, FastAPI, Python asyncio, SSE, Redis, a job queue, Phaser, or Tiled without an explicit design change.
- Pixel employees are UI projections of Subtask.type/status, not independent AI processes.
- `IN_PROGRESS` means persistent unfinished/active state. It does not promise background computation.
- Job/Subtask/Event state is server-side source of truth. Do not move business state to localStorage/widget state.

## Current implementation status

Verified in the provided sandbox:
- TypeScript core builds.
- 19/19 core tests pass.
- SQLite persistence and reopen pass.
- Legacy-schema migration is tested.
- plan_version prevents implicit stale-output reuse.
- completionEvidence is required for every completion criterion.
- Subtask dependency keys resolve to UUIDs.
- Cyclic dependencies are rejected.
- A dependent Subtask cannot start before its dependencies are DONE and valid for the current plan.
- Core HTTP dev server `/health` and `/debug/dashboard` respond locally.
- MCP entrypoint follows the stateless Streamable HTTP pattern: fresh server/transport per POST `/mcp`; GET/DELETE return 405; localhost bind by default.

Source exists but is NOT package-verified in the sandbox because its npm mirror lacks MCP packages:
- `src/mcp/createServer.ts`
- `src/mcp/main.ts`
- `web/src/component.tsx`

## First local steps

Use Node.js 22+.

```bash
npm install
npm run build:plugin
npm test
```

If `build:plugin` fails because current MCP SDK signatures differ, consult the current OpenAI Plugins docs and make the smallest compatibility fix. Preserve the domain/data behavior and tool semantics.

Then:

1. Run the MCP server locally.
2. Verify `/health`.
3. Run MCP Inspector and verify initialize, tools/list, all major tools, and UI resource.
4. Use Secure MCP Tunnel or another HTTPS tunnel.
5. Connect from ChatGPT Developer Mode.
6. Copy the resulting `plugin_asdk_app...` technical ID and use `@plugin-creator` / `$plugin-creator` to add `.app.json` plus the manifest `apps` mapping. Do not invent this ID.
7. Execute SC-10 first, then SC-01, SC-05, SC-06.

## Tool invariants

- New independent goal => `create_job`.
- Existing-goal material direction change => `replace_plan`.
- Small existing-job change => `update_job` / `update_subtask`.
- `complete_job` must reject unfinished current-plan subtasks and missing completion evidence.
- External operations without actual evidence must never be represented as completed.
- Keep tools useful even when the UI is not rendered.

## UI invariants

- ChatGPT standard composer is the conversation UI. Do not build another chat input.
- Use MCP Apps `ui/*` bridge for new UI behavior; compatibility aliases only as fallback.
- Business data comes from MCP tools.
- UI may persist only transient view state such as selected Job.
- The office must not visually imply that one logical employee is concurrently computing on multiple jobs.
