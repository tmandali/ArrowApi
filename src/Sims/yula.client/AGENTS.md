<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Architect & Report Checklist

## 🤖 Declarative YAML Agent Manifest Standards
- No commands or prompt text are hardcoded in code.
- All system, grid, and workspace agent capabilities are stored in `src/workspaces/<workspace>/agents/*.agent.yaml` (or `src/features/system/agents/`, `src/features/reports/agents/`) manifest files.
- Manifest loading runs dynamically through `yula-commands.ts` via the Webpack/Turbopack `raw-loader` infrastructure and `js-yaml`.
- **User skills (runtime, on-device):** users define their own slash commands (`lib/stores/user-skills.ts`, localStorage-persisted; pure logic in `lib/yula-user-skill.ts`). Scope is `global` or a workspace id; user skills may attach reference files (.md/.txt/.json, 32K each, validated, never scripts) shown with previews in the editor and loadable via the client-executed `read_user_file` tool (non-terminal; `run_user_skill` output lists them). They merge into the same `YulaCommand` pipe (`source: "user"`), appear in the slash palette with a `skill` badge, and send via `buildUserSkillPrompt` (`{{input}}` substitution, else append). Built-in slashes win on conflict. Creating a skill never creates an agent — skills are instruction data run by the existing Yula agent (route + tool sets); user skills are prompt-only, per-skill files/scripts are built-in-only.
- **Model skill awareness (progressive disclosure):** each turn sends only the in-scope inventory (slash/label/description, never full prompts) in the request body (`context.userSkills`); the prompt lists it under USER SKILLS. The `run_user_skill` tool (shared STATIC + grid sets, client-executed, non-terminal) loads the full instructions as tool output and the model follows them. Worked-steps render `Loaded skill: /<slash>`.
- **Built-in skills:** `/ay-kapanis` (global month-end close checklist), `/sayim-fark` (stock count variance), `/rapor-kalite` (global data-quality tour) — single source is `skills/<name>/SKILL.md` (standard Agent Skills layout: `name`/`description` + `slash`/`label`/`scope` extensions), raw-imported via the `*.md` bundler rule and parsed into `BUILT_IN_USER_SKILLS` (`lib/built-in-skills.ts`, bundler-only). Read-only, scope-filtered like user skills, resolvable via palette and `run_user_skill`; package files beyond SKILL.md (scripts/references) are inventoried in `BUILT_IN_SKILL_FILES` and shown in the skill detail files section (reference previews raw-imported).
- **User agents (persona, on-device):** users define agent identities (`lib/stores/user-agents.ts`, localStorage; pure logic in `lib/yula-user-agent.ts`): name + instructions + tool allowlist (empty = all; `grid-tools` token opens the dynamic grid group) + skill allowlist (empty = in-scope all) + scope + provider/model pin (empty = global settings; server `resolveModel` falls back to the provider default). Selection is card-based (`YulaAgentCards`, workspace-cards pattern, empty-chat only; no Yula card — unselected means default Yula) with a slim active-agent chip above the input; full management lives split by page: `/system/agents` (agents only) and `/system/skills` (User/System tabs for user vs built-in skills), both executions-panel master-detail (`AgentManagementView` / `SkillManagementView`, resizable left list + right inline editors `agent-editor` / `skill-editor`; palette footer navigates to `/system/agents`); the turn carries `context.agent`, the prompt gains a LEVEL 0 persona section, and `prepareStep.activeTools` is intersected (`filterActiveToolsByAgent`). Inference precedence: agent pin > conversation model > provider default. Skill ≠ agent: skills are data the agent loads, the agent is the identity that loads them.
- **Skill sandbox (server-only):** `lib/skill-sandbox.ts` (`createNodeSandbox`: root jail + shell-less `.mjs`-only exec with timeout/output caps) + `lib/skill-discovery.ts` (frontmatter parse + directory discovery). Never import the sandbox from client code. Scripts ship under `skills/<skill>/scripts/*.mjs` and run via the server-executed `run_skill_script` tool (non-terminal; client loop skips `SERVER_EXECUTED_TOOLS`). First script: `ay-kapanis/scripts/month-range.mjs` (deterministic month/week → ISO range). Long playbooks live under `skills/<skill>/references/` and load on demand via the server-executed `read_skill_file` tool (.md/.txt/.json only, 64K cap, non-terminal).

## 📋 Checklist When Adding a New Report / Agent (Step by Step)

Apply the following steps without exception whenever a new report or agent capability is added to the project:

1. **JSON Schema Definition (`schemas/<report>-criteria.schema.json`):**
   - Define the criteria schema with `x-scope`, `x-page-path`, `x-job-endpoint`, and `x-ai` (`aliases`, `quickPrompts`, `resultsPrompts`, `columnHints`) fields.
   - For iterative result-screen analysis, add the `x-ai.analysisTopics` (`id`, `title`, `goal`, `tool`: analyze|sql|visualize|filter, `columns`, `followUp`) playbook — after profiling, the model proposes topics as clickable bullets and the selection is examined in depth.
2. **YAML Agent Manifest Definition (`src/workspaces/<workspace>/agents/<name>.agent.yaml`):**
   - When a new workspace or feature command/agent capability is needed, define the YAML manifest file in the relevant `agents/` folder.
3. **Report Registration (`src/features/reports/report-registry.ts`):**
   - Export the created JSON schema through the relevant workspace's `index.ts` gateway and add it to the `REGISTERED_REPORTS` array with `scope`, `workspace`, `title`, `pagePath`, `aliases`, and `fullSchema`.
4. **Next.js Route Page (`src/app/`):**
   - Report Screen: `src/app/<workspace>/<report>/page.tsx` (single-page standard: criteria filters, execution history, and the result DuckDB grid are unified on one page; direct job links open via the `?jobId=<guid>` parameter).
5. **Result Screen Component (`<Report>ResultGrid.tsx`):**
   - Build the report result component on the standard OPFS + DuckDB WASM-backed `<ArrowReportGrid jobId={jobId} jobUrl={reportUrl} reportScope="<scope>" ... />` and bind it to the Form's `renderResult` prop.
6. **Path & Title Formatting (`src/lib/workspace-paths.ts`):**
   - Add the report's Turkish label to the `formatPathnameLabel(pathname)` function (`if (pathname.includes("/<workspace>/<report>")) return "<Rapor Adı>"`).

## 📊 Report Lifecycle, Single-Page Architecture, and SSE Flow

### 1. Single-Page Architecture (Single-Page Unified Report Flow)
- The report route always lives under `src/app/<workspace>/<report>/page.tsx`. Instead of separate old `[jobId]` pages, the `?jobId=<guid>` URL query parameter is used (legacy `/[jobId]` folders `redirect` to the `?jobId=` format for backward compatibility).
- The report screen consists of 3 core blocks:
  1. **Criteria Filter Form (`<Report>Form.tsx` & `<Report>Filter.tsx`)**: The user enters criteria or fills them via AI with schema-based completion.
  2. **Unified Execution Panel (`<ArrowJobExecutionsPanel />`)**:
     - Past executions list on the left (date, duration, row count, status icon).
     - Selected job's criteria (JSON or criteria table) and live progress stream (`<RunProgressSteps />`) on the right.
     - A delete trash icon appears on hover over `Completed`, `Failed`, and `Cancelled` jobs.
     - `Cancel` actions for running jobs and `Delete` actions for terminated jobs are integrated in the page header and the panel.
  3. **Result Grid Panel (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`)**: Serves large data with zero memory overhead via DuckDB WASM and the W3C OPFS disk cache.

### 2. SSE Live Event Stream (Server-Sent Events)
- **Backend (`src/Arrow.Jobs.AspNetCore/ArrowJobSse.cs`)**:
  - Endpoint: `GET /api/arrow/jobs/{jobId}/events` (`Content-Type: text/event-stream`).
  - **Anti-Buffering Headers**: `Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Prevents proxy/Next.js layers from holding back small events.
  - Each event is flushed to the client immediately via `await response.Body.FlushAsync(cancellationToken)` right after writing.
  - Supported events: `status`, `info`, `progress`, `completed`, `failed`, `cancelled`.
  - On connect, past events (`event-log`) are replayed first; then the live stream starts.
- **Client Event Dispatcher (`src/features/jobs/services/arrow-job-event-hub.ts`)**:
  - `ArrowJobEventHub`: A native `EventTarget`-based singleton Pub/Sub service independent of the React lifecycle (`arrowJobEventHub`).
  - **Deduplication**: Even if multiple components subscribe to the same `jobId`, only one SSE connection opens.
  - **Replay**: Components subscribing late via `arrowJobEventHub.subscribe(jobId, callback, { replay: true })` immediately receive the latest snapshot.
  - **Instant First Step**: When `startStream` fires (`initialPhase === "running"`), the `Running — status` step is written to the snapshot at `0ms` and reflected in the UI immediately, before the network handshake completes.
  - **Micro-Rhythm (`arrow-job-client.ts` -> `readJobSseEvents`)**: Even when the backend fires preparation steps (`status`, `info`) back-to-back within 2ms in the same TCP packet, ~70ms of visual tempo is inserted between steps so React doesn't burst them all in a single frame.
  - **Progress Speed**: High-frequency `progress` (row count) steps stream at full speed with no delay; UI notifications render fluidly with ~60ms throttling.
- **Job Status Management (`src/store/slices/active-jobs-store.ts`)**:
  - Zustand-based store tracks active jobs (`Queued`, `Running`, `Completed`, `Failed`, `Cancelled`) globally.
  - `isTerminalJobStatus(status)`: Confirms the job has terminated on `Completed`, `Failed`, `Cancelled` states.

## Yula AI (chat SDK & provider)

- **The chat path is provider-agnostic.** `/api/agent/chat` uses only `getYulaLanguageModel(...)` + `streamText({ model, tools, toolsContext, prepareStep })`. Tool calls never go into prompt text; `streamText({ tools })` + `extractReasoningMiddleware({ tagName: "think" })`. Responses stream via `toUIMessageStream({ messageMetadata })` + `createUIMessageStreamResponse` (`result.toUIMessageStreamResponse` is deprecated).
- **Phase lock is SDK-native (`prepareStep.activeTools`):** the full set is built once and locked per step by phase — `results` → grid tools, `results-loading`/image → no tools, `workspace` → criteria tools.
- **Dynamic tool descriptions (`toolsContext`):** `run_job` / `apply_criteria` / `open_last_report` / `find_matching_report` descriptions are functions; the route injects the active report's scope, title, and `required` fields. No hardcoded report list is embedded in descriptions.
- **Token tracking + compaction:** at the end of each step, `finish-step.usage` is attached to `message.metadata.usage` and shown under the reply (`2 tur · 12.3k tok · 4s`). When turn messages exceed `YULA_COMPACTION_TOKENS` (default 50,000), `pruneMessages` applies inside `prepareStep` (`reasoning: all`, tool pairs of the last 3 turns preserved).
- **Provider SDK lives only in the adapter:** `src/lib/yula-provider.ts`. No `createOllama` / `createAzure` / `createOpenAI` or `ollama:` `providerOptions` is embedded in chat/UI code.
  - Microsoft Foundry → `@ai-sdk/azure` `createAzure({ baseURL, apiKey })` (Foundry `/openai/v1` endpoint). Never use `createOpenAI` for Foundry.
  - OpenAI → `@ai-sdk/openai` `createOpenAI`.
  - Local → `ollama-ai-provider-v2` `createOllama` (keep_alive / num_ctx live in this layer's `fetch` wrapper).
- **Active provider:** `AI_PROVIDER` / `NEXT_PUBLIC_AI_PROVIDER` (`foundry` ≡ `azure`). Microsoft Foundry is the default when Azure credentials exist in env. Inference identity lives in the agent definition (provider/model pin, empty = global settings); the textbox carries no model selector. With no stored selection, no `provider` is written to the request body; the server trusts env. Thinking toggle lives on the agent cards header; `YULA_THINKING` env (0/false/no/off or 1/true/yes/on) overrides the request body when set (`resolveThinkingEnabled`).
- **Assistant text:** `sanitize-assistant-text` cleans leakage/typographic garbage; text is never `trim`med in-stream to avoid swallowing words.
- **Report phases (do not mix):** `/<workspace>/<report>` = criteria/job creation (`apply_criteria` / `run_job`). `/<workspace>/<report>/<jobGuid>` = result table analysis (grid tools). Chat history keeps `pathname` + `jobId`; when the analysis chat opens, the GUID returns to the URL. Records preserve the exact URL form the user was on (GUID path / `?job=`). When chat changes pages with ITS OWN tools (`navigate_to_page` / `run_job` and the grid-slash queue): set the `beginConversationFollow` flag before pushing, and once ARRIVED at the target, the screen-mapping effect binds the record to the new page via `followArrivedConversation` (last opened page wins, active chat is preserved, NO new chat is opened, dock auto-opens). Binding NEVER happens before the push — the persist effect would save over it on the old page. `saveMessages` never moves the page binding without content changes. When the user changes pages MANUALLY (breadcrumb/link/menu), the STRICT rule applies: every URL change opens a fresh chat (exact normalizePath match; no loose base-route/report matching); history clicks are preserved because they land on the record's exact page. On boot, `healConversationRecords` binds old records stuck on the home page to the last navigation target found in messages.
- **Multilingual LLM & Context Poisoning Prevention Standard**:
  - System feedback returned by tools to the LLM (`message`, `hint`, `error`, `directive`, `note`) **must stay neutral, standard English**.
  - Never write instructions imposing a single language (e.g. *"respond directly in Turkish"*) into tool outputs; otherwise the model cannot mirror the user's spoken language and context poisoning occurs. The response language is always determined by the user's conversational language and the LLM's natural language ability.
  - No artificial Turkish-verb regex gates (`gatedApply`) are placed in front of client-side tool calls like `apply_criteria`; in a multilingual environment, trust the model's intent verification and the Criteria Input Engine's schema rules.
- **Yula AI Panel (Side Dock) Behavior**: The Yula AI panel never switches to forced fullscreen on mobile or small screens (`isAutoFullscreen` has been removed); it keeps its side dock / sheet form and width control at all resolutions.
- **Exploration & Sampling Limit (Max 10 Records Rule)**: In exploration queries run by Yula AI (`run_expert_sql`, `analyze_grid_data`), schema samples (`get_report_schema`, `sampleRows`), or job history lists (`list_report_executions`), **never more than 10 records** may be returned to the model/context. This prevents context bloat, token waste, and model hallucination.
- **Live screen state (no tools):** Each turn, the client sends `screenSnapshot()` (`context.screenState`: draft values, focused job, last 10 executions, grid filters) + a structural `screenDiff` against the previous turn (`lib/screen-snapshot.ts`, pure and tested). The server prints `LIVE SCREEN STATE` / `SINCE LAST TURN` into the prompt. The model always sees the current screen without spending an extra tool step; there is no separate `get_screen_state` tool.
- **Worked-steps display (phase-grouped trace):** `extractWorkedSteps` output is grouped by `stepIndex` via `groupStepsByPhase` into English-labeled phases (`Exploration`, `Updates`, `Execution`, `Confirmation`, `Thinking`). Phases default open; each step shows a shadcn `Tooltip` preview on hover and expands its JSON detail on click; during live streaming the view smooth-scrolls to each new step with an entrance animation.
- **Finding-click resolution (two-tier):** analysis finding bullets (`renderBulletedItem`) never send the bare title — first `extractFindingFilterPrompt` tries a structural grid-filter prompt from the real columns, otherwise `buildFindingDrillPrompt` wraps title+description in a `[Analysis finding clicked]`/`[Analiz bulgusuna tıklandı]` click context so the model generates the detecting SQL via `run_expert_sql`.
- **Finding view pinning:** clicks resolve against the turn's source table (`extractSourceTable` reads the last concrete FROM in the turn's `run_expert_sql` calls; `active_view` never pins), not the currently active view. If the user switched views since the analysis, the grid-filter fast path is skipped and the drill prompt pins `FROM "<source>"` (CLICK CONTEXT rule honors the named table).
- **UI chrome language:** model output always mirrors the user's language; hardcoded client strings (live status, silent-turn fallback, questionnaire card) pick TR/EN via `detectUserLanguage` on the last user message (`lib/yula-lang.ts`, default TR).
- **AI↔UI transient handoff standard (`lib/ai-channel.ts`):** Anything requiring one-shot cross-screen transport (`execution focus`, AI view requests, …) opens from the `createAiChannel({ name, scopeOf })` factory; no hand-rolled `CustomEvent` + module-variable buses. The factory provides `request` (queue + instant dispatch) / `take` (one-shot, read by mount after navigation) / `subscribe` (feeds already-mounted components); TTL (default 5 min) + scope matching prevent stale/mistargeted delivery, no-op under SSR. Durable state stays in zustand stores; channels are only for one-shot transport outliving navigation, flows needing answers keep using user messages/tool outputs.
- **Layered Vector RAG (`services/duckdb-vector.ts`, serverless):** The `yula_rag_embeddings (id, scope, content, metadata, embedding, tier, workspace, version)` table is searched in DuckDB WASM via `array_cosine_distance`; embeddings persist in the OPFS cache. Layers: `global` (system routes) → `workspace` (`ws:<slug>`: report schema/criteria/columns + menus + router corpus) → `user` (chat history; stays on-device, never reaches the server). Search is filtered by the active workspace (`searchVectorContext(q, k, { workspace })`); the distance threshold is structural, not linguistic (`NEXT_PUBLIC_RAG_SHORT/MAX_DISTANCE`). When `RAG_CORPUS_VERSION` changes, OPFS + table do a full reindex. New corpora (Q&A, error signatures) only add an index function; PII (company/criteria values) is never written to the global layer.

## 🤖 Yula AI Agent Core: 3-Layer Tool Architecture

Yula AI Agent Core works with 3 main tool layers driven by screen phases (State-Driven Tool Swapping):

```
                          ┌─────────────────────────────┐
                          │     Yula AI Agent Core      │
                          └──────────────┬──────────────┘
                                         │
     ┌───────────────────────────────────┼───────────────────────────────────┐
     ▼                                   ▼                                   ▼
┌─────────────────────────┐   ┌─────────────────────────┐   ┌─────────────────────────┐
│ Layer 1: Spreadsheet    │   │ Layer 2: DuckDB SQL     │   │ Layer 3: Criteria &     │
│ (UI / View & Focus)     │   │ (Analytics & Compute)   │   │ Job Lifecycle Engine    │
├─────────────────────────┤   ├─────────────────────────┤   ├─────────────────────────┤
│ • set_grid_query        │   │ • run_expert_sql        │   │ • inspect_criteria_schema│
│ • set_grid_sort         │   │ • profile_grid_table    │   │ • get_current_criteria   │
│ • configure_grid_columns│   │ • analyze_grid_data     │   │ • validate_criteria_input│
│ • pin_grid_columns      │   │ • visualize_grid_data   │   │ • apply_criteria         │
│ • apply_grid_filters    │   │                         │   │ • run_job                │
│ • export_grid_data      │   │                         │   │ • list_report_executions │
│ • reset_grid_layout     │   │                         │   │ • find_matching_report    │
│                         │   │                         │   │ • open_last_report        │
│                         │   │                         │   │ • cancel_job             │
└─────────────────────────┘   └─────────────────────────┘   └─────────────────────────┘
```

### 1. Layer 1: Virtual Spreadsheet UI Tools
- Client-side tools that instantly change the table view the user sees.
- `set_grid_query` (DuckDB view / derived columns / GROUP BY), `set_grid_sort` (sorting), `configure_grid_columns` (show/hide/reorder columns), `pin_grid_columns` (column pinning), `apply_grid_filters` (D365 filters), `reset_grid_layout` (restore default layout), `export_grid_data` (Parquet/Excel/CSV export).

### 2. Layer 2: DuckDB SQL Tools
- Tools running analytics, statistics, and summary computations over large data.
- `run_expert_sql` (read-only SQL analytics), `profile_grid_table` (data quality, nulls, min/max metrics), `analyze_grid_data` (fast KPI computations), `visualize_grid_data` (chart data extraction).

### 3. Layer 3: Criteria Input Engine & Job Lifecycle Tools
- Tools that live-validate the report criteria form, verify D365/BC syntax, and manage the job lifecycle.
- **Criteria Input Engine (`src/features/report-criteria/lib/criteria-input-engine.ts`)**:
  - D365 / Business Central Syntax: Date and number ranges (`100..200`, `2026-08-01..2026-08-31`, `..2026-08-31`), relative dates (`dün`, `bugün`, `geçen hafta`, `bu ay`), comparisons (`>100`, `<=50`, `<>0`), and options (`10|20|30`).
  - Schema & Requiredness Checks: Missing `required` field detection from JSON Schema, `enum` checks, and type conformance.
  - Live Form Sync: The on-screen form draft is read via `get_current_criteria` / `evaluateCurrentDraftCriteria`, producing an instant validation report (`errors`, `warnings`, `sanitizedCriteria`, `summary`).
- **Job Lifecycle**:
  - `apply_criteria`: Writes validated criteria into the form and highlights them. Every call sends the FULL set (first read the draft via `get_current_criteria`, preserve user-set values); never send a partial object that drops required fields.
  - `run_job`: Starts a backend job with validated criteria. Fire-and-forget: `executed` means **queued for acceptance** only, terminal outcome is unknown — the model never claims completion/no-error, it routes to the execution screen.
  - `find_matching_report`: Checks for a completed/running job with the same normalized criteria; never starts a job (`matched` → open, `running` → inform, `no_match` → no `run_job` without approval, `needs_criteria` → ask for missing fields).
  - `open_last_report`: Opens the latest job without re-running, regardless of criteria.
  - `list_report_executions`: Lists the report's past executions.
  - `cancel_job`: Cancels a running job at backend and UI level.
