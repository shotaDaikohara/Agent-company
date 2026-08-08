# AI Office MVP

Pure Plugin MVP for persistent multi-job management inside ChatGPT.

> **2026-08-08 update**: this source was originally prepared in a sandbox without npm registry access to
> `@modelcontextprotocol/sdk` / `@modelcontextprotocol/ext-apps` (see `IMPLEMENTATION_STATUS.md`). It was
> since built and verified end-to-end (`npm install && npm run build:plugin && npm test`, plus a live
> `curl` check of the MCP endpoint) in a second environment with normal registry access, **with no source
> changes required**. Only remaining work is T-14 onward (ChatGPT Developer Mode connection), which needs
> a user's local machine and manual registration steps.

## Architecture

- ChatGPT performs reasoning and switches logical roles (manager / research / create / review).
- AI Office stores Job/Subtask/Event state and renders a pixel-office UI.
- The MVP does **not** call an LLM API from the MCP server and does not run background worker agents.
- `IN_PROGRESS` means the job remains unfinished; it does not promise background computation.

## Core-only local verification

This repository includes dependency-free core domain/storage tests using Node's built-in `node:sqlite` so the state model can be verified even before MCP/UI packages are installed.

```bash
npm run test:core
npm run dev:core
curl http://localhost:3000/health
curl http://localhost:3000/debug/dashboard
```

## Full plugin setup on a normal development machine

Install dependencies from npm, then build and verify the prepared MCP server and UI layers described in `TASKS.md` and the Google Drive basic design.

Required current packages:

- `@modelcontextprotocol/sdk` 1.30.x
- `@modelcontextprotocol/ext-apps` 1.7.x
- React 18
- zod
- esbuild

The prepared MCP server uses stateless Streamable HTTP: POST `/mcp` creates a fresh server/transport for the request; GET/DELETE `/mcp` return 405. It binds to `127.0.0.1` by default; set `HOST` explicitly for deployment. For ChatGPT testing, use a public HTTPS endpoint or Secure MCP Tunnel.

## Constraints

Do not add an OpenAI/Anthropic LLM API, worker queue, FastAPI, asyncio, SSE, Phaser, Redis, or multi-agent runtime without an explicit design change.

## 実装上の追加決定

- Node.js 22+ の `node:sqlite` をMVP永続化に使用する。現状はExperimental Warningが出るが、MVPでは許容する。
- 初期Subtaskの依存関係は `key` / `dependsOnKeys` で受け、サーバーがUUIDへ解決する。
- Subtaskは `sortOrder` を保持し、計画内の表示・処理順を安定させる。
- 循環依存は作成時に拒否する。依存Subtaskが完了していないSubtaskは `IN_PROGRESS` にできない。
- Job完了時は `completionEvidence` を完了条件ごとに必須とし、単に全SubtaskがDONEなだけでは完了させない。
- SQLiteはローカルファイル利用時にWALとbusy timeoutを使用する。

## Plugin package layout

The repository is already a valid skill-bearing plugin package:

- `.codex-plugin/plugin.json` is the required plugin manifest.
- `skills/ai-office/SKILL.md` is the bundled AI Office workflow skill.
- The MCP connection mapping (`.app.json`) is intentionally not committed yet because its `plugin_asdk_app...` technical ID is created only after the local MCP server is registered in ChatGPT Developer Mode.

After registering the MCP endpoint, use `@plugin-creator` / `$plugin-creator` with that technical ID to add `.app.json` and the manifest `apps` mapping rather than inventing an ID.
