# ArrowApi Developer Agent Decision & Evolution Log (Archive 2)

Archived decisions from September 2026 to ensure active documentation files strictly satisfy the 500-line limit.

---

## [2026-09-21] Typed Action Contract for Report Execution Inspection (`job_history:GET_DETAIL`)
- **Rationale:**
  1. *Missing Execution Telemetry in Agent Context:* Previously, the `job_history` component only provided high-level summary rows via `LIST` (`jobId`, `status`, `rowCount`). The agent could not inspect detailed runtime metrics, live SSE event history, error messages, or exact request parameters submitted for a specific report run.
  2. *Schema-First Action Contract Compliance:* In line with the `@my-agent/core` architecture, tools and actions must declare structured Zod/JSON Schema contracts (`inputSchema`, `outputSchema`, `whenToCall`, `whenNotToCall`).
- **Decision:**
  - **Modular Tool & Action Contract (`job-detail-tool.ts`):** Created dedicated modular file adhering to the 500-line limit, defining `JOB_DETAIL_ACTION_CONTRACT` with typed `summary`, `progress`, and `requestInput` schemas. Implemented `getJobDetailTool` calling backend endpoints (`getArrowJob`, `fetchJobRequest`, `fetchJobEventLog`).
  - **Dispatch Bridge Integration (`dispatch-bridge.ts`):** Routed `GET_DETAIL` and `DETAIL` on `family === "job_history"` to `getJobDetailTool`.
  - **Active Component Registration (`yula-active-components.ts`):** Exposed `GET_DETAIL` capability and action contract to `job_history`.
  - **Zero-Latency Panel Hydration (`arrow-job-executions-panel.tsx`):** Handled `GET_DETAIL` directly inside `useAgentComponent.onAction` using active React state (`selectedJob`, `progressEvents`, `inputJson`) when matching `selectedId`, with seamless fallback to server dispatch.
  - **Verification:** Unit tests in `job-detail-tool.test.ts` pass, all 242 client tests pass, and zero linter errors.
- **Author:** Antigravity / Team

---

## [2026-09-21] Protocol-Compliant Tool Result Reconciliation & Prevention of MissingToolResultsError
- **Rationale:**
  1. *Unanswered Interactive Tool Calls:* When the assistant invokes `ask_user_choice` and pauses the stream, user selection dispatches a user message without generating a corresponding `tool-result`.
  2. *LLM Protocol Rejection:* OpenAI, Gemini, and Vercel AI SDK enforce that every assistant `tool-call` must have an immediately following `tool-result`. Unmatched calls triggered `MissingToolResultsError: Tool result is missing for tool call ...` within 1s, rendering silent turn fallbacks.
- **Decision:**
  - **Automatic Interactive Result Reconciliation (`context-slim.ts`):** In `normalizeUIMessagesForTransport`, assistant tool calls (`ask_user_choice`, `ask_user_question`) preceding a user message are matched and resolved to `state: "output-available"` with `{ selected, value }`.
  - **Defensive Transport Slimming (`context-slim.ts`):** Updated `slimMessagesForTransport` to transition any non-output tool states (`call`, `input-available`, undefined) to safe fallback outputs (`output-available` / `output-error`).
  - **SDK Engine Safeguard (`route.ts`):** Passed `{ ignoreIncompleteToolCalls: true }` to `convertToModelMessages`.
  - **Client-Side State Tracking (`yula-choice-card.tsx` & `use-agent-chat.ts`):** Implemented `addToolOutput` in `useAgentChat` and wired it into `YulaChoiceCard` for immediate local part state synchronization.
- **Author:** Antigravity / Team

---

## [2026-09-22] Autonomous LLM Steering, Turn Suspension, and Seamless Resumption (Eliminating Redundant Chat Runs)
- **Rationale:**
  1. *Rigid UI Choice Lock-in:* The agent previously forced rigid `ask_user_choice` tool calls and `YulaChoiceCard` interactive button grids whenever clarification or approval was sought. In natural conversation, LLMs can autonomously decide in text whether human intervention or steering is required.
  2. *Redundant LLM Run Anti-Pattern:* Responding to choices invoked `sendMessageText()`, appending a new `role: 'user'` message and triggering a brand-new POST `/api/agent/chat` run. This discarded active tool executions, duplicated context overhead, and disrupted multi-step ReAct loops.
  3. *Native Turn Suspension & Steering:* `@my-agent/core` provides `steer()` and `PendingMessageQueue`. By introducing native suspension (`turn_suspended`, `turn_resumed`, `waitForSteering`), an ongoing turn can sleep awaiting user guidance and resume seamlessly in the exact same execution cycle.
- **Decision:**
  - **Loop Suspension Protocol (`@my-agent/core`):** Added `turn_suspended` and `turn_resumed` events to `AgentEvent`. Updated `agentLoop` to support `waitForSteering(signal)`. When `toolResult.suspend` or `shouldSuspendTurn` is true, the loop emits `turn_suspended`, awaits incoming steering input via `PendingMessageQueue.waitForMessage`, drains steered messages, emits `turn_resumed`, and continues the multi-step ReAct loop without terminating.
  - **Client-Side Steering Integration (`@my-agent/react` & `yula.client`):** Updated `useAgentChat` and `yula-chat-instance.tsx` so that `respondToChoice` and choice cards invoke `chat.steer(val)` instead of `sendMessageText(val)`.
  - **Stream API Alignment (`route.ts`):** Removed `hasToolCall("ask_user_choice")` from `stopWhen` so the LLM decides autonomously when to pause or complete.
  - **Prompt Protocol Modernization (`yula-agent-prompt.ts` & `yula-ui-skills.ts`):** Replaced rigid plain-text question prohibitions with `HUMAN-IN-THE-LOOP, SUSPENSION & STEERING PROTOCOL`. Eliminated redundant confirmation roadblocks ("Planı onaylıyor musunuz?") once criteria are gathered in favor of direct execution.
  - **Verification:** All 345 `yula.client` unit tests passed (88 suites), all 133 `@my-agent/core` tests passed (17 suites), and `pnpm --filter yula.client typecheck` passed with 0 errors. All modified files strictly comply with the 500-line ceiling.
- **Author:** Antigravity / Team

---

## [2026-09-20] Grounded ERP Workflow Protocol & Procedural Memory (Eliminating Theoretical LLM Fallback)
- **Rationale:**
  1. *Theoretical Parametric Fallback:* When a user asked about multi-step enterprise workflows, the LLM lacked verified procedural recipes in the workspace wiki. Governed by a generic rule, the model fell into parametric training memory and generated generic textbook theories detached from actual Sims ERP screens, routes, and business rules.
  2. *Missing Level 0 Recipe Discovery:* `chat/route.ts` pre-injected `playbookRules` (screen guidelines), but omitted `playbookRecipes` from Level 0 system prompt context, forcing extra search turns.
  3. *Lack of Proactive Playbook Learning:* When no company-specific recipe was found, the model failed to offer interactive Human-In-The-Loop learning chips (`ask_user_choice`) to record the company's real DAG workflow via `propose_playbook_update`.
- **Decision:**
  - **Prompt Grounding & Directives (`yula-agent-prompt.ts`):** Replaced the generic conceptual exception with the **Grounded Workflow Protocol**: ungrounded textbook essays and theoretical diagrams detached from Sims ERP are strictly forbidden. If a verified recipe exists, present its concrete DAG steps and screen routes. If not, state it transparently and offer `ask_user_choice` chips.
  - **Zero-Latency Recipe Discovery (`chat/route.ts`):** Added pre-injection of `playbookRecipes` using `serverPlaybookStorage.readEntries(wsId)`.
  - **Verification:** Simulation and prompt tests pass (35/35).
- **Author:** Antigravity / Team

---

## [2026-09-21] Robust Chart Visualization Dispatch, Parameter Aliases & Base Table Fallback
- **Rationale:** When users requested chart visualizations (e.g. "top 5 stores"), the agent defaulted to issuing raw SQL queries on `active_view` instead of triggering visualization, failed Zod validation on `orderMode: "desc"`, and encountered DuckDB Binder Errors when previous custom views masked underlying columns or filtered out requested entities.
- **Decision:**
  - **Tool & ReAct Prompt Grounding:** Added `VISUALIZE` example to `dispatch_component_action` in `standard-agent-tools.ts` and registered an autonomous execution step in `yula-agent-prompt.ts`.
  - **Schema & Order Mode Normalization:** Allowed `"desc"` and `"asc"` in `GRID_VISUALIZE_CONTRACT` and mapped them to `"value_desc"` and `"value_asc"` in `inferChartOrderMode`.
  - **Custom View & Base Table Fallbacks:** Derived columns from the probe row in `resolveActiveDataset` (`dataset.ts`) and added automatic fallback to `baseColumns` / base table in `visualizeGrid`.
- **Author:** Antigravity / Team

## [2026-09-21] Comprehensive WasmSql Architecture Migration & Legacy DuckDB Cleanup
- **Rationale:**
  1. *Architectural Disambiguation:* The browser-side WebAssembly SQL engine was historically named after a specific vendor implementation (`duckdb`). Renaming to `wasmsql` cleanly distinguishes client-side WASM execution from Next.js server-side SQL, while opening up engine-agnostic AI tooling.
  2. *Full System Cleansing:* Beyond hook aliases, a complete cleanup was needed across localization dictionaries (`tr.json`, `en.json`), KPI landing specs, core service folders (`src/services/wasmsql`), vector memory stores (`wasmsql-vector`), Pyodide skill bridges, and internal hook state variables (`tableName`, `applyFilters`, `columnWasmTypes`, `gridAggregations`).
- **Decision:**
  - **Core Service Migration (`src/services/wasmsql/`):** Established `src/services/wasmsql/` as the single source of truth (`wasm-sql-client.ts`, `wasm-sql.worker.ts`, `filter-parser.ts`, `wasmsql-vector-*`, `ai/`). Completely removed legacy `src/services/duckdb` directory and deleted obsolete proxy files.
  - **Localization & KPI Keys:** Migrated `duckdb-status` to `wasmsql-status` across Turkish and English translation files and `workspace-landing-data.ts`.
  - **Grid Props & State Variable Cleanup:** Replaced `duckTableName` with `tableName`, `duckApplyFilters` with `applyFilters`, `columnDuckTypes` with `columnWasmTypes`, and `duckDbAggregations` with `gridAggregations` across all report-grid hooks and `arrow-report-grid.tsx`.
  - **Headless AI Wasm SQL Engine:** Bound `wasm_sql_engine` component (`use-wasm-sql-agent.ts`) with `RUN_SQL`, `DESCRIBE_TABLE`, and `LIST_TABLES` action contracts and strict read-only SQL guard routing in `dispatch-bridge.ts`.
  - **Skills & Tools Integration:** Renamed Pyodide bridge to `wasmsql-pyodide-bridge.ts` and updated dataset resolver, profiler, visualizer, and RAG vector indexing to import directly from `@/services/wasmsql` and `@/services/wasmsql-vector`.
  - **Verification:** All 316 unit tests passed, all 8/8 grid test suites passed (`npm run test:grid`), 0 oxlint warnings/errors, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

## [2026-09-21] Complete Elimination of Regex-Based Intent Routing & Alignment with Reference-Pi Semantic Reasoning
- **Rationale:**
  1. *Brittle Keyword Regex Steering:* Attempting to classify user prompts using hardcoded regular expressions (`GREETING_REGEX`, `PLAN_EXECUTION_REGEX`, `WORKFLOW_CONSULTATION_REGEX`, `DIRECT_EXECUTION_REGEX`, `DATA_ANALYSIS_REGEX`, `POLICY_LEARNING_REGEX`) created a fragile keyword-maintenance loop ("her fiil için regex/prompt mu güncelleyeceğiz?").
  2. *Constraint Conflicts & Deadlocks:* Injected prompt directives (e.g. `=== DETECTED INTENT: WORKFLOW_CONSULTATION === MANDATORY: You MUST invoke ask_user_choice`) clashed with natural multi-turn context (e.g. approving an already proposed plan), inducing silent turn failures.
  3. *Reference-Pi & Vercel AI SDK Standard:* The canonical reference architecture does not filter user prompts through regex matchers. Instead, the LLM determines intent naturally through semantic conversation history, screen context, and declarative prompt rules.
- **Decision:**
  - **Deleted Regex Router (`yula-intent-router.ts` & test):** Removed all regex intent pattern matchers and early classification passes.
  - **Clean Prompt Construction (`route.ts` & `yula-agent-prompt.ts`):** Removed artificial `=== DETECTED INTENT ===` system prompt injections and `intent` context properties.
  - **Declarative System Prompt Directives:** Preserved clear behavioral contracts in `yula-agent-prompt.ts` (direct execution on active report screens, plan-first on `/`, structured choices with rationale via `ask_user_choice`, and plan execution transitions).
  - **Verification:** All 236 `yula.client` tests pass, 101 `@my-agent/core` tests pass, and zero regex router references remain in the repository.
- **Author:** Antigravity / Team

---

## [2026-09-21] Intent-Driven Routing, Rich Choice Cards (Rationale & Badge), and Elimination of Regex Buttonization
- **Rationale:**
  1. *Brittle Frontend Text Heuristics:* `markdown-blocks.tsx` previously used regular expressions (`isPromptSentenceLike`, `isActionLike`) matching keywords like `"sorgula"`, `"filtrele"`, `"aç"`, `"sonuçları"` to turn bullet points into clickable buttons. This caused arbitrary plan steps to look like buttons while others remained static text, creating severe UX inconsistency.
  2. *Lack of Rationale in User Choices:* Plan and decision options lacked explanation and justification (`rationale`), leaving users unable to evaluate the business impact and trade-offs of proposed paths.
  3. *Parametric Intent Guessing vs. First-Class Intent Routing:* Relying on the LLM to remember to output interactive chips without classifying user intent caused turns where the model announced choices in prose without emitting the `ask_user_choice` tool call.
- **Decision:**
  - **Eliminated Frontend Regex Buttonization (`markdown-blocks.tsx` & `markdown-entities.ts` & `yula-actions.ts`):** Removed `isPromptSentenceLike`, `isActionLike`, and regex-based buttonization of bullet points and quoted phrases. Removed `isRunTitle` bullet hijacking. Markdown lists, quotes, and plans are rendered strictly as clean, static text.
  - **Modernized Prepare Chain Skills (`yula-ui-skills.ts`):** Removed the legacy prompt instruction telling the model to output fake clickable bullets (`• **Run the report**`) and verb lists (`${formatLocalizedRunVerbs()}`). Replaced with structured `ask_user_choice` decision invocation.
  - **Rich Choice Contract (`ask_user_choice` & `YulaChoiceCard`):** Extended `ask_user_choice` schema in `@my-agent/core` and `standard-agent-tools.ts` with `description`, `rationale`, and `badge`. Updated `YulaChoiceCard` to render vertical decision cards displaying action, badge, description, and rationale when detailed choices are present, preserving compact chips for simple binary choices.
  - **Intent Router & Classifier (`yula-intent-router.ts`):** Created early intent classification (`WORKFLOW_CONSULTATION`, `DIRECT_EXECUTION`, `DATA_ANALYSIS`, `POLICY_LEARNING`, `GENERAL_CONVERSATION`) dynamically injecting tailored prompt directives into Level 0 system prompt. In `WORKFLOW_CONSULTATION`, the model is strictly required to emit `ask_user_choice` with `description` and `rationale`.
  - **Verification:** Unit tests in `yula-choice-card.test.ts` and `yula-intent-router.test.ts` pass (15/15), all 243 client tests pass, 101 `@my-agent/core` tests pass, 33/33 simulations pass, and all files remain strictly under 500 lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Playbook Knowledge Sub-Agent & Level-0 Context Decoupling (Vercel AI SDK Tool-as-a-Subagent Pattern)
- **Rationale:**
  1. *Context Window Bloat & Scaling Limits:* Bulk pre-injection of all workspace recipes into Level 0 system prompt context (`playbookRecipes`) degraded TTFT latency and consumed tens of thousands of tokens on every user turn, creating severe attention dilution and cost inefficiencies as the corporate catalog expanded.
  2. *Intent-to-Recipe Gap (Brittle String Overlap):* Users express complex business goals in natural language (e.g., *"ay sonu depo sayımını eşitle ve farkları raporla"*), which failed against rigid string/word overlap checks (`overlap >= 2`) when recipes were titled differently (e.g., *"Fiziksel Envanter Eşitleme Prosedürü"*).
  3. *Vercel AI SDK & Pi Alignment:* Delegating knowledge retrieval to a dedicated, isolated sub-agent invoked from within the `query_playbook` tool call allows model tiering (fast/cost-effective worker model), completely eliminates intermediate token pollution from main chat history, and provides resilient deterministic fallbacks.
- **Decision:**
  - **Isolated Sub-Agent Engine (`playbook-subagent.ts`):** Created `runPlaybookSubagent` utilizing Vercel AI SDK `generateText` with isolated system prompt, lightweight sub-tools (`search_catalog`, `inspect_recipe`, `submit_verdict`), and a 3500ms timeout sandbox with automatic fallback to deterministic index search.
  - **Tool Upgrade (`standard-agent-tools.ts`):** Upgraded `query_playbook` to delegate directly to `runPlaybookSubagent`, returning enriched resolution schemas (`recipe`, `dag`, `matched`, `confidence`, `explanation`, `screenRules`).
  - **Level-0 Prompt Decoupling (`route.ts` & `yula-agent-prompt.ts`):** Removed bulk recipe reading from `chat/route.ts` while preserving active screen rules (1-3 lines) for zero-latency local screen compliance. Updated agent instructions to invoke `query_playbook` for procedural workflows.
  - **Verification:** Added `playbook-subagent.test.ts` and updated `yula-workflow-grounding.simulation.test.ts`. 231/231 tests pass, 33/33 simulations pass, 99/99 `@my-agent/core` pass, and Next.js Turbopack build succeeds (48/48 routes).
- **Author:** Antigravity / Team

---

## [2026-09-21] Conversation Deletion & Workspace Grouping in IDE Overlay
- **Rationale:**
  1. *Missing Conversation Deletion in Fullscreen IDE Overlay:* While `/my/history` supported deletion, users working in the fullscreen IDE overlay (`YulaFullscreenOverlay` & `YulaIdeSidebar`) lacked an inline delete trigger for old or transient sessions.
  2. *Workspace Grouping Transparency:* The sidebar organizes chat sessions under folder trees labeled "Projeler" (Projects), derived from `conv.pathname` via `workspaceLabelFromPath`. Clarifying and preserving this taxonomy ensures seamless navigation and data hygiene.
- **Decision:**
  - **Inline Session & Folder Deletion (`YulaIdeSidebar`):** Updated conversation list items from static `<button>` elements to accessible, interactive rows with hover/focus-revealed `Trash2` buttons. Added bulk folder deletion allowing users to clear all sessions under a workspace folder, protected by an inline confirmation dialog (`Silinsin mi? Evet / İptal`) to prevent accidental wipeouts.
  - **Batch Deletion in Store (`chats.ts` & `yula-chat-provider.tsx`):** Implemented `deleteConversations(ids)` for atomic multi-session and vector layer purging.
  - **Active Session Deletion (`YulaDeleteChatButton` & `yula-dock-controls.tsx`):** Added a dedicated `Trash2` action button in the overlay top bar header alongside `YulaNewChatButton`, active when the current session is saved in store history.
  - **Streaming Cleanup Hardening (`yula-chat-provider.tsx`):** Extended `deleteConversation` and `deleteConversations` in the provider to abort any running `liveHelpers?.stop()` and reset custom grid views if any deleted conversation is the active session.
  - **Terminology Correction &- **Verification:** Renamed sidebar section from "Projeler" (Projects) to "Çalışma Alanları" (Workspaces). Added `delete_folder`, `confirm_clear_ask`, `confirm_yes`, `confirm_no` in `IdeOverlay` across `tr.json` and `en.json`.
- **Author:** Antigravity / Team

---

## [2026-09-21] System UI Component Action Contract Standardization (app_router, criteria_form, result_grid:active)
- **Rationale:**
  1. *Prompt Engine Parameter Omission:* In `@my-agent/core` (`component-registry.ts`), the LLM system prompt outputs action parameters (`- Parameters: { ... }`) and return types (`- Returns: { ... }`) only when `inputSchema` and `outputSchema` are declared on the action contract. Components lacking explicit `inputSchema` caused the agent to guess parameter names.
  2. *Unified Schema Contracts Across Component Families:* All system-level components (`job_history`, `app_router`, `criteria_form`, `result_grid:active`) must adhere to identical structured contracts with Zod `safeParse` validation in `dispatch-bridge.ts`.
- **Decision:**
  - **Modular Contracts:** Created `app-router-contracts.ts` (`NAVIGATE`), `criteria-form-contracts.ts` (`SET_FIELDS`, `APPLY`, `SUBMIT`, `RUN`, `SCHEMA`, `READ`, `VALIDATE`), and `result-grid-contracts.ts` (`RUN_SQL`, `QUERY`, `FILTER`, `APPLY_FILTERS`, `SORT`, `COLUMNS`, `PIN`, `RESET_LAYOUT`, `EXPORT`, `PROFILE`, `ANALYZE`, `VISUALIZE`).
  - **Component Wiring:** Replaced ad-hoc action definitions across `yula-active-components.ts`, `use-result-grid-agent.ts`, and `use-headless-system-components.ts` with standardized imported contracts.
  - **Runtime Validation:** Integrated `safeParse` in `dispatch-bridge.ts` for all system action families.
  - **Verification:** Created comprehensive test suite in `system-contracts.test.ts` (all 258 tests pass, 0 oxlint warnings/errors, all files <= 345 lines).
- **Author:** Antigravity / Team

---

## [2026-09-21] Typed Action Contract for Report Execution Inspection (`job_history:GET_DETAIL`)
- **Rationale:**
  1. *Missing Execution Telemetry in Agent Context:* Previously, the `job_history` component only provided high-level summary rows via `LIST` (`jobId`, `status`, `rowCount`). The agent could not inspect detailed runtime metrics, live SSE event history, error messages, or exact request parameters submitted for a specific report run.
  2. *Schema-First Action Contract Compliance:* In line with the `@my-agent/core` architecture, tools and actions must declare structured Zod/JSON Schema contracts (`inputSchema`, `outputSchema`, `whenToCall`, `whenNotToCall`).
- **Decision:**
  - **Modular Tool & Action Contract (`job-detail-tool.ts`):** Created dedicated modular file adhering to the 500-line limit, defining `JOB_DETAIL_ACTION_CONTRACT` with typed `summary`, `progress`, and `requestInput` schemas. Implemented `getJobDetailTool` calling backend endpoints (`getArrowJob`, `fetchJobRequest`, `fetchJobEventLog`).
  - **Dispatch Bridge Integration (`dispatch-bridge.ts`):** Routed `GET_DETAIL` and `DETAIL` on `family === "job_history"` to `getJobDetailTool`.
  - **Active Component Registration (`yula-active-components.ts`):** Exposed `GET_DETAIL` capability and action contract to `job_history`.
  - **Zero-Latency Panel Hydration (`arrow-job-executions-panel.tsx`):** Handled `GET_DETAIL` directly inside `useAgentComponent.onAction` using active React state (`selectedJob`, `progressEvents`, `inputJson`) when matching `selectedId`, with seamless fallback to server dispatch.
  - **Verification:** Unit tests in `job-detail-tool.test.ts` pass, all 242 client tests pass, and zero linter errors.
- **Author:** Antigravity / Team

---

## [2026-09-21] Protocol-Compliant Tool Result Reconciliation & Prevention of MissingToolResultsError
- **Rationale:**
  1. *Unanswered Interactive Tool Calls:* When the assistant invokes `ask_user_choice` and pauses the stream, user selection dispatches a user message without generating a corresponding `tool-result`.
  2. *LLM Protocol Rejection:* OpenAI, Gemini, and Vercel AI SDK enforce that every assistant `tool-call` must have an immediately following `tool-result`. Unmatched calls triggered `MissingToolResultsError: Tool result is missing for tool call ...` within 1s, rendering silent turn fallbacks.
- **Decision:**
  - **Automatic Interactive Result Reconciliation (`context-slim.ts`):** In `normalizeUIMessagesForTransport`, assistant tool calls (`ask_user_choice`, `ask_user_question`) preceding a user message are matched and resolved to `state: "output-available"` with `{ selected, value }`.
  - **Defensive Transport Slimming (`context-slim.ts`):** Updated `slimMessagesForTransport` to transition any non-output tool states (`call`, `input-available`, undefined) to safe fallback outputs (`output-available` / `output-error`).
  - **SDK Engine Safeguard (`route.ts`):** Passed `{ ignoreIncompleteToolCalls: true }` to `convertToModelMessages`.
  - **Client-Side State Tracking (`yula-choice-card.tsx` & `use-agent-chat.ts`):** Implemented `addToolOutput` in `useAgentChat` and wired it into `YulaChoiceCard` for immediate local part state synchronization.
- **Author:** Antigravity / Team

---

## [2026-09-21] Advanced Telemetry Engine (Relative Age, Causality Tracing, Severity Alerts & Dev Monitor)
- **Rationale:**
  1. *Token Waste and Chronological Ambiguity in LLM Prompts:* Raw ISO timestamps consume excess tokens and make it hard for language models to distinguish between events that happened 2 seconds ago versus 20 minutes ago.
  2. *Lack of Causality Across Multi-Component Pipelines:* Submitting a form, queuing a report job, streaming progress, and populating a virtual spreadsheet happen across decoupled components. Tracing an outcome or error back to its causal request required a unified correlation ID.
  3. *Purely Passive Telemetry:* Previously, errors like `REPORT_FAILED` remained in ring buffer memory until explicitly inspected. Critical system events require proactive notification capabilities (`onCritical`).
  4. *Developer Observability:* Engineers lacked a visual live inspector to verify telemetry topic segregation, deduplication, and coalescing in real time.
- **Decision:**
  - **Relative Age Calculation (`event-bus.ts`, `compaction.ts`):** Implemented `formatRelativeAge`, dynamically attaching `age` (`just now`, `15s ago`, `3m ago`) and `ageMs` to recent events and prompt context.
  - **Causality & Correlation (`types.ts`, `event-bus.ts`, `job-lifecycle-tools.ts`, `use-result-grid-agent.ts`):** Added `correlationId` to `UIEvent`, `RecordTelemetryOptions`, and `GetRecentEventsOptions`. Bound `jobId` across `REPORT_STARTED`, `REPORT_COMPLETED`, `REPORT_FAILED`, `ROW_SELECTED`, and `FILTER_APPLIED`. Added `correlation_id` filtering to `inspect_ui_state`.
  - **Proactive Severity Alerts (`types.ts`, `event-bus.ts`, `arrow-job-hub-stream.ts`):** Added `TelemetrySeverity` (`info`, `warn`, `critical`), auto-inferred severity on job lifecycle events, and implemented `onCritical` listener hook.
  - **Developer Radar Drawer (`telemetry-monitor-drawer.tsx`, `workspace-ai-dock.tsx`):** Created collapsible live inspector slide-over panel with topic filters, correlation search, live age updates, and JSON clipboard export, toggled via `YulaTelemetryButton` on the AI dock header.
  - **Verification:** 113 unit tests in `@my-agent/core` pass, 258 simulation tests in `yula.client` pass, 0 oxlint errors, all 14 touched files <= 494 lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Topic-Segmented UI Telemetry, Topic Schema Catalog & Live Grid Selection
- **Rationale:**
  1. *Starvation Immunity & Decoupled Upstream Sensing:* A naive, unindexed chronological buffer allows high-frequency UI events to push out critical domain events (e.g. job completion or criteria submission). Telemetry streams require topic segmentation (`jobs`, `data`, `form`, `navigation`, `system`).
  2. *Targeted Reflection Tooling & Schema Grounding:* Coding agents inspect logs via targeted grep/tail filters rather than dumping all system events. The LLM reflection tool (`inspect_ui_state`) requires a schema catalog (`TELEMETRY_TOPICS`) describing each topic, typical event types, and parameter descriptions to prevent hallucinated keys.
  3. *Topic-Balanced Compaction & Deduping:* LLM turns need a compact, starvation-free summary of UI activity. Naive chronological tails omit critical job or form events if user browses the grid; balanced compaction retains the latest event per event type per topic (`getTopicBalancedEvents`).
  4. *Event vs State Disambiguation:* While user clicks are events, active row selection is a persistent state. The virtual spreadsheet grid must project selection into live component `meta.selectedRow`.
- **Decision:**
  - **Topic Schema Catalog (`types.ts`):** Defined `TopicDefinition` interface and `TELEMETRY_TOPICS` catalog (`key`, `label`, `description`, `typicalEvents`), deriving `TelemetryTopic = keyof typeof TELEMETRY_TOPICS`.
  - **Event Bus Topic Engine (`event-bus.ts`):** Added automatic topic inference, `coalesceKey`, expanded ring buffer to 50, `distinctByType`, and `getTopicBalancedEvents(limitPerTopic, distinctByType)`.
  - **Targeted Inspection & Tool Grounding (`standard-tools.ts`):** Bound `inspect_ui_state` parameter schema directly to `TELEMETRY_TOPICS` descriptions and exposed `available_topics` in tool outputs.
  - **Compaction Integration (`compaction.ts`):** Updated `compactUIEvents` to deduplicate by topic and event type, preserving critical state across turns.
  - **Virtual Grid Selection & Telemetry:** Added `onRowSelect` to `VirtualSpreadsheet` and `useCellSelection`. Wired `selectedRow` state, `ROW_SELECTED`, `SORT_CHANGED`, and `FILTER_APPLIED` into `useResultGridAgent` and `ArrowReportGrid`.
  - **Verification:** 110 unit tests in `@my-agent/core` pass, 258 simulation and unit tests in `yula.client` pass, 0 oxlint warnings/errors, all files <= 493 lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Event-Driven Result Grid Table Loading Telemetry & Query Contract Parameter Parity
- **Rationale:**
  1. *Parameter Contract Desynchronization (`query` vs `sql`):* `GRID_RUN_SQL_CONTRACT` and `GRID_QUERY_CONTRACT` declared `query` as their input parameter, while backend handlers in `grid-sql-tools.ts` strictly looked for `input.sql`. This caused queries generated by LLM tools to fail silently with misleading `"SQL query is empty"` errors.
  2. *Missing Lifecycle Telemetry on Grid Ready:* When DuckDB WASM finished rendering a dataset into the virtual grid, no component-level lifecycle event was emitted. The LLM only received the backend `REPORT_COMPLETED` event (which lacks column schemas), leading the agent to blindly guess column names or fail during data aggregation.
  3. *Incomplete `inspect_ui_state` Filtering in Local Delegation:* In `ui-delegation.ts`, local invocation ignored filter parameters (`component_id`, `topic`), preventing the model from cleanly discovering active component schemas and domain events.
- **Decision:**
  - **Parameter Parity (`grid-sql-tools.ts` & `result-grid-contracts.ts`):** Updated `runExpertSql` and `setGridQuery` to accept both `input.query` and `input.sql`. Extended Zod input schemas with `.refine()` to accept either parameter name as well as `{ reset: true }`.
  - **Event-Driven `TABLE_LOADED` Emission (`use-result-grid-agent.ts`):** Registered `table_loaded` in `useAgentComponent.events` and added a dedicated lifecycle effect that emits `table_loaded` and records `TABLE_LOADED` on `uiEventBus` under the `data` topic with `tableName`, `activeView: "active_view"`, `rowCount`, and `columns`.
  - **Telemetry Filtering in `ui-delegation.ts`:** Updated `inspect_ui_state` execution in `ui-delegation.ts` to respect `component_id` (returning the mounted component schema with its metadata) and telemetry filter options (`topic`, `source`, `limit`).
  - **Verification:** 12/12 `system-contracts.test.ts` pass, 124/124 `@my-agent/core` vitest tests pass, 0 oxlint warnings/errors, and all files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] 3-Tier Diagnostic Triage & Sub-Agent Failure Analyst for Critical Telemetry
- **Rationale:**
  1. *Blind Halting vs Infinite Retries:* On `severity: 'critical'` telemetry or tool failure, models risk either halting on trivial syntax errors or spinning in infinite hallucination loops attempting to fix unrecoverable business constraints (closed periods, 401/403 permissions, 500 server crashes).
  2. *Context Poisoning:* Dumping multi-megabyte stack traces into Level-0 chat history quickly exhausts token budgets and degrades reasoning.
- **Decision:**
  - **Tier 1 Fast Deterministic Classifier (`diagnostic-triage.ts` in `@my-agent/core`):** Synchronous 0ms rule engine separating recoverable syntax/schema errors (`ZodError`, malformed JSON, DuckDB parser typos) with `action: 'SELF_HEAL'` from unrecoverable errors with `action: 'ASK_USER_CHOICE'`.
  - **Tier 2 Diagnostic Sub-Agent (`diagnostic-subagent.ts` in `yula.client`):** Isolated nested worker with a 2500ms timeout guard, sanitizing stack traces and generating tailored Turkish explanations with actionable `ask_user_choice` cards.
  - **Tier 3 Bounded Retry Guard (`DiagnosticRetryGuard`):** Limits self-heal retries to 2 attempts, automatically escalating to interactive Human-In-The-Loop once exceeded.
  - **Prompt Protocol & Wiring:** Added error triage directives in `yula-agent-prompt.ts` and subscribed to `uiEventBus.onCritical` in `yula-chat-instance.tsx`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Zero-Warning Oxlint Cleanup, Fast Refresh Conformance & Hook Immutability
- **Rationale:**
  1. *Build Noise & Quality Standards:* Oxlint reported 14 warnings across `yula.client` including unused identifiers, non-component exports in fast-refresh modules, synchronous `setState` inside `useEffect`, and unsafe ref mutation during unmount cleanup.
  2. *React Compiler & Fast Refresh Purity:* Exporting Zustand stores alongside UI components (`telemetry-monitor-drawer.tsx`) or lowercase rendering functions (`pdfx-chart-renderers.tsx`) broke React Fast Refresh hot-reloading boundaries. Mutating local accumulator variables inside JSX `.map` loops violated React Compiler immutability.
- **Decision:**
  - **Dead Code Pruning:** Removed unused imports `Agent`, `AgentSession`, `isTerminalJobStatus`, and type `UserAgent`.
  - **Module & Store Isolation:** Extracted `useTelemetryMonitorStore` into dedicated `src/lib/stores/telemetry-monitor.ts`. Unexported internal helper `getCategoryIcon` in `workspace-search-result-row.tsx`.
  - **PascalCase Component Architecture in React PDF:** Converted `renderBarChart`, `renderHorizontalBarChart`, `renderLineAreaChart`, and `renderPieDonutChart` into proper typed React components (`BarChartRenderer`, `HorizontalBarChartRenderer`, `LineAreaChartRenderer`, `PieDonutChartRenderer`) consuming standard props. Extracted pure slice geometry calculator `computePieSlices` to enforce immutability during render.
  - **Hook Lifecycle Cleanups:** Replaced synchronous `setColumns(initialColumns)` inside `useEffect` with React's canonical render-time state adjustment pattern (`prevInitialColumns`) to eliminate cascading paints. Replaced raw mutable `queryTimeoutRef` with stable `clearQueryTimeout` callback in `useDuckStreamSubscription` to eliminate ref mutation warnings in cleanup.
  - **Verification:** Oxlint reports 0 warnings and 0 errors across all 762 files. All 262 unit and simulation tests pass. All files comply with the 500-line ceiling.
---

## [2026-09-21] Conversation Deletion & Workspace Grouping in IDE Overlay
- **Rationale:**
  1. *Missing Conversation Deletion in Fullscreen IDE Overlay:* While `/my/history` supported deletion, users working in the fullscreen IDE overlay (`YulaFullscreenOverlay` & `YulaIdeSidebar`) lacked an inline delete trigger for old or transient sessions.
  2. *Workspace Grouping Transparency:* The sidebar organizes chat sessions under folder trees labeled "Projeler" (Projects), derived from `conv.pathname` via `workspaceLabelFromPath`. Clarifying and preserving this taxonomy ensures seamless navigation and data hygiene.
- **Decision:**
  - **Inline Session & Folder Deletion (`YulaIdeSidebar`):** Updated conversation list items from static `<button>` elements to accessible, interactive rows with hover/focus-revealed `Trash2` buttons. Added bulk folder deletion allowing users to clear all sessions under a workspace folder, protected by an inline confirmation dialog (`Silinsin mi? Evet / İptal`) to prevent accidental wipeouts.
  - **Batch Deletion in Store (`chats.ts` & `yula-chat-provider.tsx`):** Implemented `deleteConversations(ids)` for atomic multi-session and vector layer purging.
  - **Active Session Deletion (`YulaDeleteChatButton` & `yula-dock-controls.tsx`):** Added a dedicated `Trash2` action button in the overlay top bar header alongside `YulaNewChatButton`, active when the current session is saved in store history.
  - **Streaming Cleanup Hardening (`yula-chat-provider.tsx`):** Extended `deleteConversation` and `deleteConversations` in the provider to abort any running `liveHelpers?.stop()` and reset custom grid views if any deleted conversation is the active session.
  - **Terminology Correction & i18n:** Renamed sidebar section from "Projeler" (Projects) to "Çalışma Alanları" (Workspaces). Added `delete_folder`, `confirm_clear_ask`, `confirm_yes`, `confirm_no` in `IdeOverlay` across `tr.json` and `en.json`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Option B Governance & Approval Lifecycle for Procedural Playbook (Draft Isolation & Admin Review Screen)
- **Rationale:**
  1. *Unrestricted Production Mutations:* Standard users or agent proposals previously committed workflow recipes and screen rules directly to production company wikis via `recordEntry`. Allowing non-administrative roles to alter canonical corporate workflows poses severe governance and compliance risks.
  2. *Need for Draft Isolation (Zero Leakage):* Newly proposed rules and recipes must be quarantined in `proposals/` (`status: "draft"`) so that active Level 0 prompt injection and `findRecipe` queries ignore them until officially sanctioned by an administrator.
  3. *Admin Visual DAG Inspection:* Administrators require a dedicated review interface (`/system/playbooks`) featuring interactive flowchart rendering (`WorkflowGraphCanvas`), step inspection, and one-click `[Approve & Publish]` or `[Reject]` actions.
- **Decision:**
  - **Core Governance Models (`@my-agent/core`):** Extended `PlaybookEntry` with `status: 'draft' | 'approved' | 'rejected'`, `proposedBy`, `reviewedBy`, and `changeSummary`. Added `readProposals`, `writeProposal`, `approveProposal`, and `rejectProposal` to `IPlaybookStorageAdapter` and `PlaybookService`.
  - **Tool Adapter Quarantining (`ui-tool-adapter.ts`):** Modified `propose_playbook_update` to invoke `proposeEntry` instead of `recordEntry`, ensuring non-admin proposals enter the draft pool awaiting admin authorization.
  - **Server File Storage (`playbook-server.ts`):** Added isolated storage in `storage/wiki/workspaces/<workspace>/proposals/` and promotion logic moving approved recipes to `workflows/` or `screens/` while updating `index.md` and logging `proposal_approved`.
  - **Dedicated API (`/api/agent/playbook/proposals`):** Created endpoints for proposal retrieval, draft creation, approvals, and rejections.
  - **Visual Admin UI (`PlaybookProposalsTab` & `/system/playbooks`):** Created modular proposal review tab with DAG flowchart preview, diff view, and decision buttons, integrated into `PlaybooksManagementView` and guarded by `RequireAdmin`.
  - **Navigation Integration:** Added `Kural & Akış Onayları` to `systemNav`, `global-nav-drawer.tsx`, `module-nav-menu.tsx`, and `workspace-landing-data.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Comprehensive WasmSql Architecture Migration & Legacy DuckDB Cleanup
- **Rationale:**
  1. *Architectural Disambiguation:* The browser-side WebAssembly SQL engine was historically named after a specific vendor implementation (`duckdb`). Renaming to `wasmsql` cleanly distinguishes client-side WASM execution from Next.js server-side SQL, while opening up engine-agnostic AI tooling.
  2. *Full System Cleansing:* Beyond hook aliases, a complete cleanup was needed across localization dictionaries (`tr.json`, `en.json`), KPI landing specs, core service folders (`src/services/wasmsql`), vector memory stores (`wasmsql-vector`), Pyodide skill bridges, and internal hook state variables (`tableName`, `applyFilters`, `columnWasmTypes`, `gridAggregations`).
- **Decision:**
  - **Core Service Migration (`src/services/wasmsql/`):** Established `src/services/wasmsql/` as the single source of truth (`wasm-sql-client.ts`, `wasm-sql.worker.ts`, `filter-parser.ts`, `wasmsql-vector-*`, `ai/`). Completely removed legacy `src/services/duckdb` directory and deleted obsolete proxy files.
  - **Localization & KPI Keys:** Migrated `duckdb-status` to `wasmsql-status` across Turkish and English translation files and `workspace-landing-data.ts`.
  - **Grid Props & State Variable Cleanup:** Replaced `duckTableName` with `tableName`, `duckApplyFilters` with `applyFilters`, `columnDuckTypes` with `columnWasmTypes`, and `duckDbAggregations` with `gridAggregations` across all report-grid hooks and `arrow-report-grid.tsx`.
  - **Headless AI Wasm SQL Engine:** Bound `wasm_sql_engine` component (`use-wasm-sql-agent.ts`) with `RUN_SQL`, `DESCRIBE_TABLE`, and `LIST_TABLES` action contracts and strict read-only SQL guard routing in `dispatch-bridge.ts`.
  - **Skills & Tools Integration:** Renamed Pyodide bridge to `wasmsql-pyodide-bridge.ts` and updated dataset resolver, profiler, visualizer, and RAG vector indexing to import directly from `@/services/wasmsql` and `@/services/wasmsql-vector`.
  - **Verification:** All 316 unit tests passed, all 8/8 grid test suites passed (`npm run test:grid`), 0 oxlint warnings/errors, 0 tsc errors, all files strictly $\le 500$ lines.
---

## [2026-09-21] Conversation Deletion & Workspace Grouping in IDE Overlay
- **Rationale:**
  1. *Missing Conversation Deletion in Fullscreen IDE Overlay:* While `/my/history` supported deletion, users working in the fullscreen IDE overlay (`YulaFullscreenOverlay` & `YulaIdeSidebar`) lacked an inline delete trigger for old or transient sessions.
  2. *Workspace Grouping Transparency:* The sidebar organizes chat sessions under folder trees labeled "Projeler" (Projects), derived from `conv.pathname` via `workspaceLabelFromPath`. Clarifying and preserving this taxonomy ensures seamless navigation and data hygiene.
- **Decision:**
  - **Inline Session & Folder Deletion (`YulaIdeSidebar`):** Updated conversation list items from static `<button>` elements to accessible, interactive rows with hover/focus-revealed `Trash2` buttons. Added bulk folder deletion allowing users to clear all sessions under a workspace folder, protected by an inline confirmation dialog (`Silinsin mi? Evet / İptal`) to prevent accidental wipeouts.
  - **Batch Deletion in Store (`chats.ts` & `yula-chat-provider.tsx`):** Implemented `deleteConversations(ids)` for atomic multi-session and vector layer purging.
  - **Active Session Deletion (`YulaDeleteChatButton` & `yula-dock-controls.tsx`):** Added a dedicated `Trash2` action button in the overlay top bar header alongside `YulaNewChatButton`, active when the current session is saved in store history.
  - **Streaming Cleanup Hardening (`yula-chat-provider.tsx`):** Extended `deleteConversation` and `deleteConversations` in the provider to abort any running `liveHelpers?.stop()` and reset custom grid views if any deleted conversation is the active session.
  - **Terminology Correction & i18n:** Renamed sidebar section from "Projeler" (Projects) to "Çalışma Alanları" (Workspaces). Added `delete_folder`, `confirm_clear_ask`, `confirm_yes`, `confirm_no` in `IdeOverlay` across `tr.json` and `en.json`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Intent-Driven Routing, Rich Choice Cards (Rationale & Badge), and Elimination of Regex Buttonization
- **Rationale:**
  1. *Brittle Frontend Text Heuristics:* `markdown-blocks.tsx` previously used regular expressions matching keywords like `"sorgula"`, `"filtrele"`, `"aç"` to turn bullet points into clickable buttons, creating severe UX inconsistency.
  2. *Lack of Rationale in User Choices:* Plan and decision options lacked explanation and justification (`rationale`).
  3. *Parametric Intent Guessing vs. First-Class Intent Routing:* Relying on the LLM to remember to output interactive chips caused turns where the model announced choices without emitting `ask_user_choice`.
- **Decision:**
  - **Eliminated Frontend Regex Buttonization:** Removed regex-based buttonization of bullet points and quoted phrases. Markdown lists, quotes, and plans are rendered strictly as clean, static text.
  - **Rich Choice Contract (`ask_user_choice` & `YulaChoiceCard`):** Extended `ask_user_choice` schema in `@my-agent/core` with `description`, `rationale`, and `badge`. Updated `YulaChoiceCard` to render vertical decision cards.
  - **Intent Router & Classifier (`yula-intent-router.ts`):** Created early intent classification dynamically injecting tailored prompt directives into Level 0 system prompt.
- **Author:** Antigravity / Team

---

## [2026-09-21] Playbook Knowledge Sub-Agent & Level-0 Context Decoupling (Vercel AI SDK Tool-as-a-Subagent Pattern)
- **Rationale:**
  1. *Context Window Bloat & Scaling Limits:* Bulk pre-injection of all workspace recipes into Level 0 system prompt context degraded TTFT latency and consumed tens of thousands of tokens.
  2. *Intent-to-Recipe Gap:* Rigid string/word overlap checks failed when recipes were titled differently.
  3. *Vercel AI SDK & Pi Alignment:* Delegating knowledge retrieval to a dedicated, isolated sub-agent invoked from within `query_playbook` tool call allows model tiering and eliminates intermediate token pollution.
- **Decision:**
  - **Isolated Sub-Agent Engine (`playbook-subagent.ts`):** Created `runPlaybookSubagent` utilizing Vercel AI SDK `generateText` with isolated system prompt, lightweight sub-tools, and a 3500ms timeout sandbox with fallback to deterministic search.
  - **Tool Upgrade (`standard-agent-tools.ts`):** Upgraded `query_playbook` to delegate directly to `runPlaybookSubagent`.
  - **Level-0 Prompt Decoupling (`route.ts` & `yula-agent-prompt.ts`):** Removed bulk recipe reading from `chat/route.ts` while preserving active screen rules.
- **Author:** Antigravity / Team

---

## [2026-09-21] Complete Elimination of Regex-Based Intent Routing & Alignment with Reference-Pi Semantic Reasoning
- **Rationale:**
  1. *Brittle Keyword Regex Steering:* Attempting to classify user prompts using hardcoded regular expressions (`GREETING_REGEX`, `PLAN_EXECUTION_REGEX`, `WORKFLOW_CONSULTATION_REGEX`, `DIRECT_EXECUTION_REGEX`, `DATA_ANALYSIS_REGEX`, `POLICY_LEARNING_REGEX`) created a fragile keyword-maintenance loop ("her fiil için regex/prompt mu güncelleyeceğiz?").
  2. *Constraint Conflicts & Deadlocks:* Injected prompt directives (e.g. `=== DETECTED INTENT: WORKFLOW_CONSULTATION === MANDATORY: You MUST invoke ask_user_choice`) clashed with natural multi-turn context (e.g. approving an already proposed plan), inducing silent turn failures.
  3. *Reference-Pi & Vercel AI SDK Standard:* The canonical reference architecture does not filter user prompts through regex matchers. Instead, the LLM determines intent naturally through semantic conversation history, screen context, and declarative prompt rules.
- **Decision:**
  - **Deleted Regex Router (`yula-intent-router.ts` & test):** Removed all regex intent pattern matchers and early classification passes.
  - **Clean Prompt Construction (`route.ts` & `yula-agent-prompt.ts`):** Removed artificial `=== DETECTED INTENT ===` system prompt injections and `intent` context properties.
  - **Declarative System Prompt Directives:** Preserved clear behavioral contracts in `yula-agent-prompt.ts` (direct execution on active report screens, plan-first on `/`, structured choices with rationale via `ask_user_choice`, and plan execution transitions).
  - **Verification:** All 236 `yula.client` tests pass, 101 `@my-agent/core` tests pass, and zero regex router references remain in the repository.
- **Author:** Antigravity / Team

---

## [2026-09-22] Action Contracts Standardization & Elimination of Heuristic JSON String Guessing
- **Rationale:**
  1. *Fragile JSON Guessing Across Output Payloads:* UI components were performing unstructured string JSON parses (`JSON.parse(content[0].text)`, `JSON.parse(trimmed)`) and regex extractions (`/Options:\s*(\[.*?\])/`) instead of relying on typed Action Contracts (`ActionContract`).
  2. *Deterministic UI Affordance:* Visual charts, interactive user choices (`ask_user_choice`), report execution status (`SUBMIT`/`RUN`), and diagnostic subagent verdicts must be strictly guarded by registered action schemas.
- **Decision:**
  - **Visualization Contract (`GRID_VISUALIZE_CONTRACT` & `parseChartOutput`):** Expanded `outputSchema` in `result-grid-contracts.ts` to declare `chart`, `rows`, and `sql`. Refactored `parseChartOutput` in `yula-chart-utils.ts` to read directly from `(output.details ?? output)` without string parsing or `content[0].text` JSON parsing. Added `isChartActionContract(toolName, input)` in `yula-chat-turn-helpers.tsx`.
  - **User Choice Contract (`ask_user_choice` & `parseChoiceData`):** Removed `/Options:\s*(\[.*?\])/` regex and `JSON.parse` from `yula-choice-card.tsx`, reading directly from structured `input` and `output.details`.
  - **Job Execution Contract (`isJobActionContract` & `extractJobStartedAction`):** Replaced ad-hoc status/string checks in `yula-chat-turn.tsx` and `yula-chat-turn-helpers.tsx` with contract-driven checking and structured `{ jobId, navigateTo }` extraction.
  - **Diagnostic Triage Subagent Contract (`DIAGNOSTIC_VERDICT_SCHEMA`):** Enforced Zod contract validation with `safeParse` in `diagnostic-subagent.ts`.
- **Verification:**
  - 364/364 unit and simulation tests passed in `yula.client` (93 suites, 0 failures).
  - Oxlint passed with 0 warnings and 0 errors on 798 files.
  - All modified files strictly obey the 500-line ceiling rule.
- **Author:** Antigravity / Team

---

## [2026-09-22] Yula Full-Mode In-Place Conversation Selection (Zero Unwanted Screen Navigation)
- **Rationale:**
  1. *Unwanted Navigation to Report Screen:* When users are working inside Yula's fullscreen IDE overlay or on the home screen (`/`), clicking a past conversation from history or the left sidebar triggered `navigateToConversationScreen -> router.push(href)`. This forcibly routed the browser to `/stock/retail-sales-report/<jobId>` and collapsed full mode (`expanded: false`), throwing the user into the report screen against their intent.
  2. *In-Place IDE Navigation Contract:* Inside an IDE interface, selecting a conversation should only switch the active conversation and render its chat messages and telemetry in-place. Background route navigation belongs to the explicit exit action (`X` button / Escape) or dedicated link buttons, not casual conversation selection.
- **Decision:**
  - **Full-Mode Navigation Guard (`yula-history-navigation.ts`):** In `navigateToConversationScreen`, added a guard: if `isExpanded || (typeof window !== "undefined" && isWorkspaceHomePath(here))`, `restoreConversationExecution` still restores execution state in memory, but route navigation (`push(href)`) is bypassed.
  - **Internal Action Tagging (`yula-history-item.tsx` & `yula-ide-sidebar.tsx`):** Added `data-ide-action="true"` and `data-slot="ide-conversation-item"` to ensure global capture click listeners never treat conversation item clicks as external screen navigations.
  - **In-Place History View (`yula-ide-sidebar.tsx`):** Bound "Konuşma Geçmişi" button to `setHistoryOpen(true)` instead of routing to `/my/history`.
- **Verification:**
  - All 372 unit and simulation tests passed in `yula.client` across 94 suites.
  - Oxlint passed with 0 warnings and 0 errors.
  - All modified files remain strictly $\le 500$ lines (`wc -l`).
- **Author:** Antigravity / Team

---

## [2026-09-22] Playbook Governance & Index Integrity Fix (Draft Approval + id-based Paths)
- **Rationale:**
  1. *Governance Bypass:* `propose_playbook_update` called `recordEntry()` (immediate approved) despite advertising user confirmation, so agent-saved rules landed in `screens/` while operators watched the empty `proposals` tab on `/system/playbooks`.
  2. *Index/File-Name Mismatch:* `PlaybookService` computed `relativePath` from `targetPath` (`screens/<target>.md`) while `ServerFsPlaybookStorage.writeEntry` persisted `<id>.md`, breaking index links and colliding duplicate targets.
- **Decision:**
  - Core (`src/yula-ai/packages/agent-core/src/playbook.ts`): added `playbookRelativePath()` single source of truth (`<sub>/<id>.md`); `recordEntry` and `approveProposal` use it; added `reindexWorkspace()` to repair legacy indexes.
  - Agent (`src/Sims/yula.client/src/lib/server-tools/standard-agent-tools.ts`): `propose_playbook_update` now calls `proposeEntry()` (draft, status `proposed`) and returns approval guidance pointing to `/system/playbooks` proposals tab.
  - Data repair: rebuilt `storage/wiki/workspaces/stock/index.md` with id-based paths (2 screen rules + 2 workflow recipes).
  - Tests (`playbook.test.ts`): added id-based path and legacy reindex repair assertions.
- **Verification:**
  - `@my-agent/core` typecheck passed; all 139 unit tests passed (17 files).
  - `yula.client` typecheck shows 8 pre-existing errors in unrelated files (account-status-guard, ai-chat-message, dispatch-bridge, diagnostic-subagent); none in touched files.
  - All modified files remain strictly <= 500 lines.
- **Author:** OpenCode / Team

---

## [2026-09-22] Playbook Admin View Data Source Fix (REST Instead of Empty Memory Context)
- **Rationale:**
  1. *Empty Admin Lists:* `PlaybooksManagementView` read entries/log via `useAgentPlaybook`, which resolves to the library `playbookManager` (MemoryPlaybookStorage) because `yula.client` never mounts `AgentProvider`. Approved disk records therefore never appeared in Screens/Workflows/Log tabs; only the directly-fetched Proposals tab worked. Deletes were memory-only and never reached disk.
- **Decision:**
  - App (`src/Sims/yula.client/src/workspaces/my/components/playbooks/playbooks-management-view.tsx`): replaced context-memory hook with REST state — `GET /api/agent/playbook?workspace=` for entries+log, `DELETE /api/agent/playbook?id=&workspace=` for removal, refresh after delete; proposals flow unchanged.
- **Verification:**
  - File is 492 lines (<= 500). `pnpm run lint` passed with 0 warnings/errors on 798 files. `pnpm run typecheck` reports no errors in the touched file (8 pre-existing errors elsewhere remain).
- **Author:** OpenCode / Team

---

## [2026-09-22] Yula Fullscreen Overlay Header Controls Streamlining & Universal Exit X Button
- **Rationale:**
  1. *Trapped in Fullscreen on Home (`SystemHomeView`):* When opening conversations from history while on the home route (`/`), Yula mounts `SystemHomeView` in fullscreen mode. Previously, `hideWindowControls={true}` and `isOverlay={false}` suppressed the `X` button and `Escape` key listener, trapping users in fullscreen and preventing them from returning to the underlying report screen.
  2. *Single Intuitive Exit Action:* Users expect an `X` button and `Escape` hotkey under all fullscreen conditions to exit full mode and return to their active screen with the side-dock open.
- **Decision:**
  - **Universal Exit (`YulaExitOverlayButton` & `use-exit-overlay.ts`):** Extracted `useExitOverlay` hook into a dedicated module to adhere to React Fast Refresh. Bound both `YulaExitOverlayButton` and the global `Escape` key listener to `useExitOverlay`.
  - **Screen Execution Resolution (`yula-screen-resolver.ts` & `yula-history-navigation.ts`):** Enhanced `resolveTargetScreen` with `hrefForConversation` and `restoreConversationExecution`. When exiting fullscreen on home or switching conversations in `YulaIdeSidebar`, the application resolves the specific `/scope/<jobId>` route and restores the report execution.
  - **Unconditional Rendering in Fullscreen Overlay:** Updated `yula-fullscreen-overlay.tsx` to render `{!hideWindowControls && <YulaExitOverlayButton />}`, and removed `hideWindowControls={true}` from `SystemHomeView.tsx`.
  - **Guarded `hrefForConversation`:** Ensured home roots (`/`) do not generate malformed `//<jobId>` paths when conversation pathname is root.
- **Verification:**
  - All 6 unit tests in `src/lib/yula-screen-resolver.test.ts` passed.
  - All 15 tests in `yula-navigation-overlay.test.ts` and `yula-navigation-simulation.test.ts` passed.
  - Zero Oxlint errors/warnings across all 7 modified files.
  - All modified files remain strictly $\le 500$ lines (`wc -l`).
- **Author:** Antigravity / Team



