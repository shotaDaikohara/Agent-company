# AI Office MVP Tasks

- [x] T-00 Design finalized in Google Drive
- [x] T-01 Core TypeScript project scaffold
- [x] T-02 Domain types and state-machine rules
- [x] T-03 SQLite persistence and restart persistence test
- [x] T-04 Official MCP SDK server layer — verified 2026-08-08 in a second environment with npm registry access
- [x] T-05 Read-side service operations (list/get/dashboard)
- [x] T-06 Basic update operations (create/update/subtask/priority)
- [x] T-07 Replan/cancel/complete business rules
- [x] T-08 skills/ai-office/SKILL.md draft
- [x] T-09 MCP Apps UI resource + React bundle — `build:web`/`build:plugin` verified against real `@modelcontextprotocol/ext-apps`
- [x] T-10 Pixel-office visual implementation — `web/src/component.tsx`（部長室/調査席/企画席/レビュー席、avatar bob animation）
- [x] T-11 UI tool actions — refresh/select/change_priority/cancel call through `tools/call` via postMessage bridge (code-reviewed; not yet exercised inside a real ChatGPT host — see T-14)
- [x] T-12 Core automated tests
- [x] T-13 MCP Inspector verification — MCP Inspector itself not run interactively, but `curl` against the live JSON-RPC endpoint (`initialize`, `tools/list`, `tools/call` for `create_job`/`render_dashboard`, `resources/read`) confirmed equivalent behavior; see "Verified in a second environment" below
- [~] T-14 ChatGPT Developer Mode connection — in progress. User registered the MCP server (via a
  cloudflared quick tunnel to the locally running server) in ChatGPT Developer Mode on 2026-08-08.
  App ID `asdk_app_6a76fccc7c788191a12ac0f6d44166c5` / Version ID
  `asdk_app_v_6a76fccc7c808191bb54737570a5d9b2` were issued. Still needed: the `plugin_asdk_app...`
  form of the ID from the browser URL bar, run through `@plugin-creator` (ChatGPT Work mode) or
  `$plugin-creator` (Codex) — neither is available to Claude Code — to produce `.app.json`. Once that
  file's content is provided, `.codex-plugin/plugin.json`'s `apps` field (now `"./.app.json"`) will
  resolve correctly. Dev-mode connection itself is fully working (see T-15 below) — `.app.json` is
  only needed for the eventual non-dev distribution/publish step, not for using the plugin now.
- [~] T-15 SC-01 E2E — first real ChatGPT conversation run 2026-08-08: `render_dashboard` showed the
  pixel-art office with 0 jobs, then "10月の連休に家族旅行へ行きたい。計画しておいて。" correctly
  called `create_job` with 5 ordered subtasks (destination compare → transport → lodging →
  itinerary/budget → review). Caught a real gap: the model's first reply implied ongoing background
  progress ("進めるようにしてある") instead of stating plainly that all 5 subtasks were still TODO;
  it only gave the accurate state when the user pushed back, but the correction itself matched
  SKILL.md's "no fake background agents" rule. Tightened SKILL.md 2026-08-08 to require proactively
  stating "N subtasks, all TODO, no output" right after `create_job`/`replace_plan` instead of vague
  progress language. Not yet re-tested after that SKILL.md edit, and the conversation has not yet
  exercised `update_subtask`/`complete_job` or a second `render_dashboard` showing non-zero jobs.
- [ ] T-16 SC-05 E2E
- [ ] T-17 SC-10 E2E
- [ ] T-18 SC-06 safety E2E
- [x] T-19 Final README / handoff — this file + `README.md` + `IMPLEMENTATION_STATUS.md` updated 2026-08-08

## Origin of this copy

This is the source from `ai-office-mvp-source.zip` (Google Drive), built and verified in a **different**
sandbox than the one that produced it. That original sandbox's npm mirror lacked
`@modelcontextprotocol/sdk` / `@modelcontextprotocol/ext-apps` (see the historical notes below, kept for
context). This environment's npm registry had both packages, so `npm install`, `npm run build:plugin`,
and `npm test` were run here without modification — no compatibility fixes were needed.

## 2026-08-08 実装メモ（この環境での再検証）

- `npm install` / `npm run build:core` / `npm run test:core` / `npm test`: 19/19 PASS
- `npm run build:plugin`（`build:web` + `tsc -p tsconfig.plugin.json`）: 修正不要でPASS
- MCP Serverを実際に起動し、`curl`でJSON-RPCを直接叩いて確認：
  - `initialize` → protocolVersion/capabilities/instructionsが正しく返る
  - `tools/list` → 11個のTool（`create_job`〜`render_dashboard`）を確認
  - `GET /mcp`・`DELETE /mcp` → 405
  - bindは`127.0.0.1`のみ（外部到達不可）
  - `tools/call` で `create_job` → `render_dashboard` を実行し、実ファイルDB（`AI_OFFICE_DB`）を使った場合は
    別リクエストをまたいで状態が保持されることを確認（`:memory:`は1リクエストごとに新規DBになるため
    永続化確認には使わないこと — テスト時の注意点として記録）
  - `resources/read` で `ui://ai-office/dashboard-v1.html` を取得し、`mimeType: text/html;profile=mcp-app`
    でReactバンドル入りのHTMLが返ることを確認
- `node-shims.d.ts` は削除した（この環境には実際の `@types/node` があり、シムがあると型定義が衝突するため）。
  元の隔離環境専用の対処だったので、`tsconfig.core.json` の `include` からも参照を外した。

## 過去の記録（元のサンドボックスでの状況、参考として保持）

- Core build/test: PASS
- 自動テスト: 16/16 PASS（その後19/19まで拡充）
- 実装済み: Domain, SQLite, state machine, plan_version, completion evidence, subtask key dependency resolution, cycle detection, dependency gating, dashboard presenter
- MCP / React source: 作成済み。ただしこの隔離環境のnpm mirrorに `@modelcontextprotocol/sdk` / `@modelcontextprotocol/ext-apps` がないため、実パッケージを使ったbuildは未検証だった。

## Current verified tests

- 19/19 core tests PASS.
- Includes SC-10 independent multi-job state, SC-05 plan replacement/stale-output exclusion, and SC-06 false-completion prevention.
- Full ChatGPT/MCP E2E (T-14〜T-18) remains pending until a user runs Developer Mode connection locally
  (see `README.md`「ChatGPTへの接続」)。
