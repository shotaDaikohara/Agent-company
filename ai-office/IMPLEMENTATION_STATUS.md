# Implementation status

Updated 2026-08-08 after building/testing this source in a second environment with normal npm registry
access (the original sandbox that produced this source could not resolve
`@modelcontextprotocol/sdk` / `@modelcontextprotocol/ext-apps`; see TASKS.md「過去の記録」).

## Verified (this environment, real packages, no source changes needed)

- Core TypeScript build (`tsc -p tsconfig.core.json`): PASS
- Core tests: 19/19 PASS
- SQLite reopen/persistence: PASS
- Legacy schema migration: PASS
- Core `/health`: PASS
- Core `/debug/dashboard`: PASS
- **Plugin build (`npm run build:plugin`, real `@modelcontextprotocol/sdk` + `@modelcontextprotocol/ext-apps`): PASS**
- **MCP server started locally and exercised over real JSON-RPC (`curl`)**:
  - `initialize` returns correct protocolVersion/capabilities/instructions
  - `tools/list` returns all 11 tools
  - `GET /mcp` / `DELETE /mcp` → 405
  - Binds to `127.0.0.1` only
  - `tools/call create_job` then `tools/call render_dashboard` on a file-backed DB (`AI_OFFICE_DB`)
    shows the created Job across separate HTTP requests (confirms the stateless-per-request
    server/transport still shares durable state through the SQLite file)
  - `resources/read` for `ui://ai-office/dashboard-v1.html` returns
    `mimeType: text/html;profile=mcp-app` with the bundled React UI inlined

## Implemented core capabilities

- Job / Subtask / Event domain model
- Job and Subtask state transitions
- Multiple independent Job persistence
- Priority changes
- WAITING_USER blocking calculation
- Plan replacement with plan_version
- Explicit stale-output reuse tagging
- completionCriteria + completionEvidence completion guard
- key / dependsOnKeys UUID resolution
- dependency-cycle rejection
- dependency-ready enforcement before IN_PROGRESS
- stable Subtask sortOrder
- cancellation with history preservation
- compact dashboard projection

## Still not verified — requires a real ChatGPT client (T-14〜T-18)

- Secure MCP Tunnel / HTTPS tunnel exposure
- ChatGPT Developer Mode registration and `plugin_asdk_app...` technical ID (must not be invented —
  obtain it from the actual registration step)
- End-to-end conversation → `tools/call` → SQLite → UI refresh loop inside the real ChatGPT host
- UI-initiated tool calls (`refresh`/`selectJob`/`changePriority`/`cancelSelected` in
  `web/src/component.tsx`) have been code-reviewed but not exercised inside a real host iframe/postMessage
  bridge — only the server side of `tools/call` has been curl-verified
- SC-01 / SC-05 / SC-06 / SC-10 conversational E2E scenarios (the equivalent business-logic assertions
  are covered by `tests/scenarios.test.ts`, but not a live ChatGPT conversation)

These require a user's local machine, ChatGPT Developer Mode access, and manual registration steps —
they cannot be completed by an agent alone.
