# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

## [2026-09-22] Canonical NextAuth Refresh Token Rotation Error Propagation & Immediate Sign-In Redirect
- **Rationale:**
  1. *Hanging Authenticated State on Fatal Refresh Failure:* When Keycloak or Google refresh tokens expired or were revoked (`invalid_grant: Token is not active`), `auth.ts` deleted `token.accessToken`, `token.refreshToken`, and `token.expiresAt`. However, the JWT cookie and `session.user` (`id`, `name`, `email`) remained intact, causing NextAuth and route guards (`proxy.ts`) to treat the session as still `authenticated`.
  2. *401 Cascades & Broken UI:* Users were stranded on internal screens without valid Bearer tokens, resulting in silent API failures (401 Unauthorized), unpopulated datasets, and no redirect to login.
- **Decision:**
  - **Standard NextAuth Token Error Tagging (`lib/auth.ts`):** On fatal refresh failures (`res.status === 400 && invalid_grant | invalid_client | unauthorized_client`), set `token.error = "RefreshTokenError"`. Added `error?: "RefreshTokenError" | string` to `Session` interface and mapped `session.error = token.error`.
  - **Server-Side Route Guard Enforcement (`src/proxy.ts`):** Updated route proxy to evaluate `isExpired = session?.error === "RefreshTokenError"` and require `!isExpired` for `isAuth`. Automatically appends `?reason=session_expired` when redirecting to `/sign-in`.
  - **Client-Side Reactive Sign-Out (`AccountStatusGuard`):** Added detection for `session?.error === "RefreshTokenError"` to trigger `signOut({ callbackUrl: "/sign-in?reason=session_expired" })`, instantly clearing the browser session cookie.
  - **Sign-In Notice & i18n (`page.tsx`, `tr.json`, `en.json`):** Added `isSessionExpired` check and localized `session_expired_notice` ("Oturum süreniz doldu. Lütfen tekrar giriş yapın." / "Your session has expired. Please sign in again.").
- **Verification:**
  - 355/355 unit tests passed (`pnpm test`).
  - `pnpm lint` (oxlint) passed with 0 errors/warnings on 797 files.
  - `pnpm check:i18n` passed with code 0.
  - All modified files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-22] Deterministic Event Hashing (FNV-1a) & Repeat Count Aggregation
- **Rationale:**
  1. *Telemetry Noise & Buffer Saturation:* Rapid consecutive UI events (search typing, row clicks, criteria applying) rapidly exhausted the 50-item ring buffer with duplicate entries, washing out previous historical events.
  2. *Token Overhead in Prompt Context:* Sending identical unaggregated events to the LLM context consumed unnecessary tokens and obscured frequency patterns.
  3. *Zero Call-Site Requirement:* Introducing event fingerprinting must not require retrofitting hundreds of calling components across workspaces.
- **Decision:**
  - **Canonical Serialization (`canonicalStringify`):** Recursively orders dictionary keys alphabetically so that `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }` produce identical hashes.
  - **Non-Cryptographic FNV-1a Hashing (`fnv1a32` & `computeEventHash`):** High-speed 32-bit hash returning an 8-character hex string, executing in sub-microsecond time in browser threads.
  - **Centralized Auto-Enrichment (`UIEventBus.recordTelemetry`):** Automatically computes `eventHash`, sets `repeatCount: 1`, and `firstTimestamp: now`. For identical repeats within the dedup window, increments `repeatCount++` and updates `timestamp` while preserving `firstTimestamp`.
  - **UIEvent Interface Extension (`types.ts`):** Added optional `eventHash?: string; repeatCount?: number; firstTimestamp?: number;` ensuring 100% backward compatibility.
- **Verification:**
  - Added 3 unit tests to `event-bus-dedup.test.ts` verifying hash determinism, key invariance, and count incrementing.
  - 137/137 `@my-agent/core` tests pass.
  - 355/355 `yula.client` tests pass.
  - All modified files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-22] Elimination of Duplicate Job Triggers, RPC Event Bus Semantics & Criteria Form De-duplication
- **Rationale:**
  1. *Duplicate Job Execution on Single User Request:* In single-agent turns executing reports (e.g. `NAVIGATE` -> `SET_FIELDS` -> `SUBMIT`), two distinct background jobs were being triggered on the backend with different GUIDs (e.g. `b87622a7...` and `1d782188...`).
  2. *Dual Registration & Listener Stacking:* `useHeadlessSystemComponents` registered and subscribed to `criteria_form:<scope>` for all `REGISTERED_REPORTS` globally. When navigating to the report screen, `useScreenAgentContext` redundantly re-registered `criteria_form:<scope>` and attached a second handler to `uiEventBus`.
  3. *Broadcast Looping in Action Dispatch:* `uiEventBus.dispatch` iterated through all subscribers (`for (const handler of list) outcome = handler(...)`), which violated RPC command semantics and caused every registered handler to fire duplicate remote job creations.
  4. *Unregister Leaks on Navigation:* When unmounting, `useScreenAgentContext` unregistered the component from `uiRegistry`, destroying the global headless registration.
- **Decision:**
  - **Single Active Handler RPC Dispatch (`@my-agent/core/event-bus.ts`):** Enforced single active handler semantics in `uiEventBus.dispatch` (`const handler = list[list.length - 1]`). UI action dispatches to a specific component ID now execute strictly once instead of looping through all historical listeners.
  - **Single Source of Truth for Criteria Forms (`use-screen-agent-context.tsx`):** Removed redundant `criteria_form:<reportScope>` registration and unregistration from `useScreenAgentContext`. The canonical, typed registration in `useHeadlessSystemComponents` remains the authoritative provider with full action contracts.
  - **In-Flight Job Idempotency Guard (`job-lifecycle-tools.ts`):** Updated `runJobTool` to check `findActiveJobByPayload(scope, result.instance)` before sending `createArrowJob`. If an identical job is already `Queued` or `Running`, it refocuses and reuses the active job instead of spawning duplicates.
- **Verification:**
  - 134/134 `@my-agent/core` unit tests pass (including new `dispatch` duplicate handler test in `event-bus.test.ts`).
  - 355/355 `yula.client` tests pass across 89 suites.
  - All modified files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-22] Interactive Choice Bullets & Enriched Event Bus HITL Protocol
- **Rationale:**
  1. *Passive Text Roadblocks:* When the LLM asked a clarifying or disambiguating question with bullet options (e.g. *"Hangi şirket koduyla devam edelim? ● TJ01 ● TJ02 ● TRLC ● Kriterleri değiştir"*), bullet points were rendered as static text. Users had to manually type their answer, leading to redundant chat turns and typos.
  2. *Loss of ReAct Steering Context:* Sending a text prompt created a new chat message, risking the model treating the user selection as a brand-new task rather than resolving the active suspended/waiting turn.
  3. *Unconnected UI Form State:* Selecting an option did not update the registered screen criteria form immediately, requiring a round-trip LLM dispatch to sync form state.
- **Decision:**
  - **Context-Aware Choice Chip Transformation (`chat-markdown.tsx`, `markdown-chips.tsx`, `yula-choice-inference.ts`):** Detected question context (`/\?\s*$/` or question keywords) in preceding blocks or heading lines. Transformed short bullet items ($\le 50$ chars) under questions into interactive clickable `<InteractiveChoiceChip />` buttons with subtle orange/primary styling.
  - **HITL Enriched Telemetry & Criteria Dispatch (`ai-chat-message.tsx`):**
    1. On click, broadcasts `CHOICE_SELECTED` telemetry on `uiEventBus` enriched with `questionContext`, `inferredField` (e.g. `CompanyCode`, `WarehouseCode`), and `targetComponent: "criteria_form"`.
    2. Immediately updates registered `criteria_form` components via `uiEventBus.dispatch({ component_id, action: "SET_FIELDS", payload: { [inferredField]: value } })`.
    3. Seamlessly resumes the waiting agent via native steering (`respondToChoice(val)` if suspended, `steer(val)` if turn is active, or `sendPrompt(val)` otherwise) without losing the ReAct execution state.
  - **Verification:** Added `yula-choice-bullet.test.ts` (4/4 pass), all 353 client tests pass across 89 suites (`npm test`), 0 oxlint warnings/errors on 797 files, all modified files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-22] Provider Authentication Badges, Connection Dialog Pre-fill & Disconnect (Logout)
- **Rationale:**
  1. *Provider Status Ambiguity:* Users running `/provider` or `/login` could not visually distinguish which LLM providers had active sessions or valid API keys versus unconfigured services.
  2. *Empty Connection Dialog & Missing Logout:* Opening the connection dialog previously failed to pre-fill default provider URLs for unauthenticated services, failed to display current credentials for logged-in services, and lacked an explicit Disconnect (Logout) mechanism.
  3. *Active Provider Model Prioritization:* In the `/model` selector, models were not sorted or decorated by the active provider, making it difficult to find relevant models.
- **Decision:**
  - **Provider Command Decoration (`yula-commands.ts`):** Extended `YulaCommand` with `badge`, `badgeVariant` (`active` | `success` | `muted`), and `isLoggedIn`. Updated `matchProviderSubcommands` to decorate and sort providers by status: active first (`● Aktif`), configured second (`● Giriş yapıldı`), unconfigured last (`Giriş gerekli`).
  - **Connection Dialog Pre-fill & Logout (`yula-provider-dialog.tsx`):** Pre-populated unauthenticated providers with official default URLs (`azure`, `ollama`, `openai`, `agnes`, `nvidia`, `openrouter`, `opencode`, `google`). Added status badge and explicit "Çıkış Yap" (Logout) button for authenticated providers with session/credential purging.
  - **Active Provider Models Prioritization (`matchModelSubcommands` & `use-chat-composer.ts`):** Added multi-provider defaults to `DEFAULT_AUTHORIZED_MODELS`, prioritized active provider models to the top of `/model` with `● Aktif` badge, and re-fetched models on provider switch.
  - **Verification:** 346/346 client unit tests pass across 88 suites, 0 tsc errors, all files $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-22] Model Identifier Uniqueness & Deduplication Defense in Depth
- **Rationale:**
  1. *Duplicate React Key Console Error:* When multiple providers (e.g. OpenRouter and OpenCode) or proxy endpoints expose identical model IDs (e.g. `google/gemma-3-12b-it`), `<SelectItem key={m.id} value={m.id}>` in `YulaContextUsageBadge` rendered duplicate keys, triggering React warnings and invalid Radix UI Select state.
  2. *Cross-Provider Collisions & Stale Storage:* `allModels` aggregation in `/api/agent/models` appended all models from all available providers without deduplication, and browser localStorage cached these duplicates.
- **Decision:**
  - **Context Window UI Protection (`yula-context-usage-badge.tsx`):** Added `uniqueModelsList` memo ensuring case-insensitive model ID uniqueness when populating the Radix UI `<Select>` items and lookups.
  - **Server-Side Route Deduplication (`/api/agent/models/route.ts`):** Prioritized the active provider and deduplicated `allModels` array by model ID.
  - **Provider Fetcher Guard (`yula-provider-models-fetcher.ts`):** Deduplicated live provider response arrays before caching and returning.
  - **Storage Sanitization (`yula-ai-client-config.ts`):** Sanitized and deduplicated `allModels` on retrieval from `loadModelsFromStorage` and `fetchCachedYulaModels`.
  - **Verification:** Unit test added in `yula-provider-models-fetcher.test.ts`, all 346 unit tests pass across 88 suites, 0 errors.
- **Author:** Antigravity / Team

---

## [2026-09-21] AgentArch Enterprise Benchmark Integration: Non-Reasoning Scratchpad (`synthesize_collected_information`) & Pass^k Evaluation Suite
- **Rationale:**
  1. *Enterprise Reliability Gap ($Pass\text{^}8 \le 6.34\%$):* The ServiceNow AgentArch benchmark (arXiv:2509.10769) demonstrated that state-of-the-art LLMs struggle with multi-step deterministic business constraints, failing to repeat workflows across consecutive trials unless safeguarded.
  2. *Thinking Tool Synergy (+22.3% Accuracy):* Non-reasoning models (GPT-4o, Agnes, LLaMA) lack internal scratchpads, frequently hallucinating date intervals (leap years, month boundaries) or criteria quantities when dispatching actions directly. The benchmark proved explicit thinking tools elevate performance from 48.5% to 70.8%.
  3. *ReAct Fragility vs. Function Calling:* Multi-Agent ReAct was proven to cause severe tool hallucinations (up to 36%), confirming Yula AI's architectural choice of Single Agent Native Function Calling with dynamic tool pruning.
- **Decision:**
  - **Zero-Side-Effect Thinking Tool (`thinking-tools.ts`):** Implemented `synthesize_collected_information` in `STANDARD_AGENT_TOOLS` with a zero-mutation contract. Non-reasoning models use it to verify dates, balance reconciliation, and parameter ordering before dispatching mutations.
  - **Conditional Step Routing (`yula-step-router.ts` & `chat/route.ts`):** `prepareStepRouting` inspects `hasNativeThinking: isThinking`. Models with native reasoning tokens (o3-mini, Claude Extended Thinking, Gemini Flash Thinking) dynamically prune this tool to prevent unnecessary token latency.
  - **Enterprise Eval Suite Upgrade (`evals.ts`):** Upgraded `EvalRunner` with `evaluateExecution` computing the AgentArch Acceptable Score ($C(r) \cdot A(r) \cdot O(r)$), separating strict tool execution from lenient read-only allowances, and measuring $Pass@1$ and $Pass\text{^}k$ repeatability.
  - **Verification:** 4/4 Vitest evals pass in `@my-agent/core` (`evals.test.ts`), 327/327 unit tests pass in `yula.client` (including new `yula-step-router.test.ts` thinking tests), all files $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Typesafe Component Family and Dispatch Architecture (`JobComponentFamily`, `ComponentFamily`)
- **Rationale:**
  1. *Fragmented Naming & Silent Failures:* Job components were addressed by three disparate aliases (`arrow_job`, `arrow_job_manager`, `job_history`). In `my-agent-pi-bridge.ts`, only `job_history` was handled, causing `arrow_job` cancel/status calls to fall back into generic labels without proper trace descriptions.
  2. *Compile-Time Safety vs Untyped Strings:* While actions had union types (`JobHistoryAction`, `CriteriaFormAction`), `component_id` was an arbitrary untyped string. TypeScript could not prevent incompatible actions being sent to component families (e.g. sending `CANCEL` to `criteria_form`).
- **Decision:**
  - **Typesafe Family Contracts (`dispatch-types.ts`):** Defined `JobComponentFamily` ("arrow_job" | "arrow_job_manager" | "job_history") and `ComponentFamily`, accompanied by runtime type guards `isJobFamily` and `isComponentFamily`.
  - **Colocated Action Types & Hub Aggregation:** Relocated action type unions (`CriteriaFormAction`, `ResultGridAction`, `AppRouterAction`, `JobHistoryAction`, `WasmSqlAction`) into their respective `*-contracts.ts` definition files (Single Source of Truth), importing and aggregating them into `dispatch-types.ts`.
  - **Component ID Parser & Literal Types (`parseComponentId`, `ComponentId`):** Extracted `parseComponentId` to safely separate family from `subId` across colons, supporting scoped component IDs (`${ComponentFamily}:${string}`).
  - **Pi Bridge & Dispatch Synchronization:** Replaced fragile manual OR-checks with `isJobFamily` across `dispatch-bridge.ts` and `my-agent-pi-bridge.ts`, providing dedicated trace labels (`Cancelled job`, `Job execution`) for in-flight job actions.
  - **Verification:** 325/325 unit tests pass (including 9 new tests in `dispatch-types.test.ts`), 0 oxlint warnings/errors, all files strictly $\le 500$ lines (`dispatch-bridge.ts`: 386 lines, `dispatch-types.ts`: 118 lines).
- **Author:** Antigravity / Team

---

## [2026-09-21] Decoupling & Relocation of VirtualSpreadsheet to Standalone Component
- **Rationale:**
  1. *Domain Independence:* `VirtualSpreadsheet` was historically placed inside `features/jobs/components/` as a job result viewer. In reality, it is a generic, high-performance in-browser spreadsheet component (`VirtualSpreadsheet<T>`) independent of Arrow Jobs.
  2. *Modular Architecture:* Decoupled the spreadsheet engine and its 10 hooks from the backend computation domain, elevating it to a first-class shared UI component.
- **Decision:**
  - **Relocated Standalone Subsystem:** Moved `VirtualSpreadsheet` and its hooks, types, Canvas 2D sizing, and test suite to `src/components/virtual-spreadsheet/`.
  - **Backward-Compatible Proxy:** Converted `src/features/jobs/components/VirtualSpreadsheet.tsx` into a thin proxy re-exporting types and component. Updated report-grid consumers and `package.json`'s `test:grid` script.
  - **Verification:** 8/8 grid tests pass (`npm run test:grid`), 309/309 client tests pass, 0 oxlint warnings/errors, 0 tsc errors, all files $\le 500$ lines (`VirtualSpreadsheet.tsx`: 478 lines, `arrow-report-grid.tsx`: 489 lines).
- **Author:** Antigravity / Team

---

## [2026-09-21] Arrow Jobs Domain Types Relocation & Decoupling from Yula Namespace
- **Rationale:**
  1. *Domain Ownership & Layering:* `YulaActiveJobSummary` and `YulaJobContext` were previously declared inside prompt formatting utilities and loosely associated with the Yula client app. In reality, Arrow Jobs are a general distributed compute engine (`Arrow.Jobs`) on the backend (`ArrowJobModels.cs`), independent of Yula.
  2. *Status Completeness & Type Safety:* Jobs exist in multiple states beyond "active" (e.g. `Queued`, `Running`, `Completed`, `Failed`, `Cancelled`, `Idle`). Confining the naming to `ActiveJobSummary` obscured terminal and pending lifecycle phases.
- **Decision:**
  - **Canonical Domain Model (`src/features/jobs/types.ts`):** Moved canonical models (`ArrowJobLifecycleState`, `normalizeJobState`, `isTerminalJobState`, `ArrowJobSummary`, `ArrowJobContext`) into `types.ts` alongside existing job domain types.
  - **Backward-Compatible Aliasing:** Preserved `YulaActiveJobSummary = ArrowJobSummary` and `YulaJobContext = ArrowJobContext` aliases in `types.ts`, `job-agent-grounding.ts`, and `yula-agent-prompt.ts`.
  - **Verification:** 309/309 tests passing, 0 oxlint warnings/errors, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Arrow Jobs Decoupled State Machine (`arrow_job`) and Catalog Manager (`arrow_job_manager`)
- **Rationale:**
  1. *Jobs as State Machines, Not Static Panels:* Arrow Jobs transition across 5 discrete lifecycle states (`queued` -> `running` -> `completed` | `failed` | `cancelled`). Treating them merely as an "active" flag or blending them into `job_history` conflated the runtime execution monitor with the archival history catalog.
  2. *Clear ReAct Responsibility:* An agent cancelling or inspecting an in-flight computation should target `arrow_job`, whereas listing, selecting, or searching historical executions should target `arrow_job_manager`.
- **Decision:**
  - **Focused Job State Machine (`arrow_job` & `useArrowJobAgent`):** Created `useArrowJobAgent` (200 lines) binding `id: "arrow_job"`. Manages state-aware metadata (`status`, `phase`, `currentStep`, `durationMs`, `totalRows`, `error`), lifecycle events (`job_started`, `job_progress`, `job_completed`, `job_failed`, `job_cancelled`), and actions (`CANCEL`, `GET_STATUS`, `GET_SUMMARY`).
  - **Catalog Manager (`arrow_job_manager` & `useJobExecutionsAgent`):** Refactored `useJobExecutionsAgent` (206 lines) to focus on catalog management (`LIST`, `SELECT`, `OPEN_LAST`, `FIND`, `REFRESH`). Simultaneously registers `job_history` for 100% backward compatibility.
  - **Dispatch Bridge & Prompt Grounding:** Updated `dispatch-bridge.ts` to route actions for `arrow_job`, `arrow_job_manager`, and `job_history`. Updated `yula-agent-prompt.ts` with explicit ReAct guidance and state-aware prompt grounding.
  - **Verification:** 307/307 tests pass, 0 oxlint errors/warnings, 0 tsc errors, all files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Colocated Component AI Architecture (VirtualGrid, CriteriaGrid, LocalSqlEngine)
- **Rationale:**
  1. *Monolithic Prompt Bloat:* `yula-agent-prompt.ts` had bloated to 477 lines, dangerously close to the 500-line ceiling (Rule 2). It centralized internal state formatting, DuckDB table naming, view mode string logic, and action contracts for generic UI components (VirtualGrid, CriteriaForm, DuckDB).
  2. *Violation of Feature-First Colocation:* Each generic component should own its AI capabilities (prompt grounding, action contracts, metadata type guards, and hooks) rather than relying on a global prompt builder knowing every component's internal structure.
- **Decision:**
  - **VirtualGrid AI Module (`features/jobs/components/report-grid/ai/`):** Created `grid-agent-grounding.ts` (pure TypeScript, server-safe) encapsulating `YulaGridContext`, `ResultGridMetaPayload`, `isResultGridMeta`, `resolveEffectiveGrid`, and `formatGridPromptGrounding`. Re-exported contracts from `index.ts`. Added isolated unit test `grid-agent-grounding.test.ts`.
  - **CriteriaGrid AI Module (`features/report-criteria/ai/`):** Created `criteria-agent-grounding.ts` and `index.ts` encapsulating active report context rules, direct execution directives, and criteria contracts. Added isolated unit test `criteria-agent-grounding.test.ts`.
  - **Local SQL Engine AI Module (`services/duckdb/ai/`):** Created `duckdb-agent-grounding.ts` and `index.ts` encapsulating DuckDB engine constants (`DUCKDB_ACTIVE_VIEW_NAME`) and read-only execution directives.
  - **Orchestrator Delegation & Line Reduction:** `yula-agent-prompt.ts` delegates to `formatGridPromptGrounding` and `formatCriteriaPromptGrounding`, while maintaining 100% backward-compatible re-exports. Reduced `yula-agent-prompt.ts` from 477 lines down to 346 lines (-131 lines).
  - **Verification:** 300/300 unit tests pass, 0 oxlint errors, 0 tsc errors, all files strictly comply with the 500-line limit.
- **Author:** Antigravity / Team

---

## [2026-09-21] Explicit Base Table vs Active Saved Query Distinction in Telemetry, Component Meta & System Prompt
- **Rationale:**
  1. *Ambiguous View State in Telemetry:* When users navigated between saved queries or reverted to the base table, `VIEW_TRANSFORMED` emitted only `{ viewId, title, query }` to `uiEventBus.recordTelemetry`. It omitted the physical DuckDB table name (`baseTable`), the active view name (`activeView`), and `isBaseTable: boolean`. Additionally, it was never emitted to `@my-agent/react` component ring buffer via `emit("view_transformed", ...)`.
  2. *Incomplete Component Metadata:* `useResultGridAgent` was called in `arrow-report-grid.tsx` without passing `customQueryTitle`, `activeAiViewId`, or `savedViews`. Consequently, `result_grid:active.meta` lacked visibility into the currently active saved query or the catalog of available views.
  3. *Unclear LLM System Prompt Grounding:* `buildSystemPrompt` previously displayed `Active table: <tableName>` without explicitly distinguishing the physical base table (which holds all raw detail records) from the active screen view (which may be grouped or projected by a saved query).
- **Decision:**
  - **Enriched Hook Contracts (`use-result-grid-agent.ts`):** Extended `UseResultGridAgentOptions` with `customQueryTitle`, `activeAiViewId`, and `savedViews`. Registered `baseTable`, `isBaseTable`, `activeView`, `activeAiViewId`, `customQueryTitle`, and `savedViews` into `result_grid:active.meta`. Updated `events.view_transformed` schema to enforce `{ baseTable, activeView, isBaseTable, viewId, title, query, rowCount }`.
  - **Component Event & Telemetry Parity (`use-result-grid-agent.ts`):** In `handleViewTransformed`, both `emit("view_transformed", payload)` and `uiEventBus.recordTelemetry` are invoked with the complete payload. Added automatic transition tracking via `useEffect` ref across `[isTableReady, activeAiViewId, customQuerySql, customQueryTitle]` so transitions from tab selection, agent `RUN_SQL`, or `RESET_LAYOUT` are always captured.
  - **Props Threading & Line Economy (`arrow-report-grid.tsx`):** Threaded `customQueryTitle`, `activeAiViewId`, and `savedViews` into `useResultGridAgent` while compacting the `yulaContext` dependency array to maintain the file strictly at 489 lines ($\le 500$).
  - **Clear Prompt Grounding (`yula-agent-prompt.ts`):** Grounded `VIEW MODE: SAVED QUERY [ID: "..."]` vs `BASE TABLE VIEW`, explicit `• Base Physical Table: "<baseTable>" (Stores all raw detail records)`, `• Active Screen View: "active_view"`, and `AVAILABLE SAVED VIEWS: [...]`.
  - **Verification:** 295/295 tests pass, 0 oxlint warnings/errors, clean `tsc --noEmit`, all modified files comply with the 500-line rule.
- **Author:** Antigravity / Team

---

## [2026-09-21] Grid Schema Grounding from Mounted Components, Read-Only DuckDB Inspection & Telemetry Source Alignment
- **Rationale:**
  1. *Missing Grid Schema Grounding (`yula-agent-prompt.ts`):* In the `@my-agent/react` runtime, client-side requests send `uiContext` containing `active_components` and `recent_events`. While `result_grid:active` was mounted and registered with full table/column metadata, `buildSystemPrompt` only checked `if (phase === "results" && context?.grid)`. When `context.grid` was omitted over the wire, active table name, row count, and available columns were never injected into the system prompt. Consequently, when the user asked "hangi tablo açık", the agent had no grid context and hallucinated that the results table was not loaded/accessible.
  2. *DuckDB Read-Only Inspection Blocked by SQL Guard (`sql-guard.ts`):* When the user asked to filter by a store (e.g. "T006 yı süz"), the agent attempted schema inspection via `DESCRIBE active_view`. `guardReadOnlySelect` strictly required queries to start with `SELECT` or `WITH`, rejecting safe read-only commands (`DESCRIBE`, `DESC`, `SHOW`, `SUMMARIZE`). When `RUN_SQL` errored, the agent concluded that the result table was inaccessible. Furthermore, appending `LIMIT 200` to `DESCRIBE` is invalid in DuckDB syntax.
  3. *Telemetry Source Mismatch in `inspect_ui_state`:* `useResultGridAgent` emitted telemetry with `source: "result_grid"`, but registered the component as `result_grid:active`. When `inspect_ui_state` queried by `component_id: "result_grid:active"`, `getRecentEvents` filtered strictly with `e.source === src || e.source.startsWith(src)`, yielding empty telemetry results.
- **Decision:**
  - **Type-Safe Component-Driven Grid Grounding (`yula-agent-prompt.ts` & `yula-tool-info.ts`):** Replaced unsafe type casts (`as Partial<YulaGridContext>`) and raw magic strings (`(c: any) => c.id === "result_grid:active" || c.id.startsWith("result_grid")`) with strictly typed guards: `isResultGridComponentId(id: unknown): id is ResultGridComponentId`, `isResultGridComponent(comp: unknown): comp is ComponentSchema & { id: ResultGridComponentId }`, `isResultGridMeta(meta: unknown): meta is ResultGridMetaPayload`, and `resolveEffectiveGrid(context, activeComps)` pure helpers. `normalizeFiltersRecord` safely maps filter objects. Active table, row count, DuckDB view, and columns are cleanly extracted and grounded into the system prompt without runtime assumptions.
  - **Safe Read-Only Inspection Support (`sql-guard.ts`):** Expanded `guardReadOnlySelect` to permit `select`, `with`, `describe`, `desc`, `show`, and `summarize`. Added `isSelectOrWith` guard so automatic `LIMIT` is only appended to `SELECT`/`WITH` statements and not to schema inspection commands. Added unit test suite `sql-guard.test.ts` (9/9 passing).
  - **Direct Filter Action Guidance (`yula-agent-prompt.ts`):** Instructed the ReAct loop prompt to use `action: 'FILTER'` (with `field`, `value`, `op: 'eq'`) directly when the user requests filtering a column value, eliminating unnecessary `DESCRIBE` calls since columns are already grounded in context.
  - **Telemetry Source Alignment (`use-result-grid-agent.ts` & `event-bus.ts`):** Updated `useResultGridAgent` telemetry calls to emit `source: "result_grid:active"`, and enhanced `getRecentEvents` to match bidirectionally (`src.startsWith(e.source)`).
- **Author:** Antigravity / Team

---

## [2026-09-21] Type-Safe Tool Error Guards, Grid Visualize Schema Alignment & Card Rendering
- **Rationale:**
  1. *Untyped Error Extraction (False-Positive Errors):* `extractToolErrorMessage` in `yula-tool-info.ts` cast objects to `Record<string, unknown>` and inspected `det.message` without verifying `det.status === "error"`. Consequently, successful query transformations (e.g. `Grid view updated to "..." (519 rows)`) were misclassified as failures and rendered as red `Hata: ...` in the UI.
  2. *Schema & Tool Parameter Mismatch (Infinite Retry Loop):* `GRID_VISUALIZE_CONTRACT` exposed `dimension` and `metric`, whereas `visualizeGrid` looked for `dimensionX` and `dimensionY`. When models adhered to the schema, `labelKey` remained empty, throwing `Invalid category column: `. When models pivoted to `dimensionX` per error hint, default Zod stripping removed the unknown key, causing persistent failure.
  3. *Missing Chart Card Dispatch Handling:* `yula-chat-turn.tsx` and `yula-chat-turn-helpers.tsx` only matched the legacy `visualize_grid_data` tool name and missed `dispatch_component_action` with action `VISUALIZE` / `CHART`.
  4. *Agressive Top-N Limit Stripping:* `setGridQuery` stripped all `LIMIT \d+` regexes, turning intentional Top-N views (e.g. `LIMIT 5`) into full table loads (519 rows).
- **Decision:**
  - **Type-Safe Status & Error Guards (`yula-tool-info.ts`):** Introduced `FAILED_TOOL_STATUSES`, `FailedToolStatus`, `ToolStatus`, `ToolErrorPayload`, and type guards `isFailedToolStatus(status)` and `isToolErrorPayload(val)`. Updated `extractToolErrorMessage` and `isFailedToolInfo` to safely discriminate errors from success messages.
  - **Bilingual & Passthrough Visualize Contract (`result-grid-contracts.ts` & `grid-visualize-tool.ts`):** Added aliases `dimension`/`dimensionX`/`labelKey`, `metric`/`dimensionY`/`valueKeys`, `type`/`chartType`, chart options (`limit`, `aggregation`, `orderMode`, `title`, `description`, `takeaway`), and `.passthrough()`.
  - **Unified Dispatch Card Rendering (`yula-chat-turn.tsx` & `yula-chat-utils.ts`):** Enabled `<YulaChartCard>` rendering for `dispatch_component_action:VISUALIZE` and added unwrapping for `output.details`.
  - **Preserve Top-N Intent (`grid-sql-tools.ts`):** Retained user/agent Top-N limits (e.g. `LIMIT 5`) while only stripping default auto-guard limits (200/500/1000).
- **Author:** Antigravity / Team

---

## [2026-09-21] Semantic Text Taxonomy, Role-Based Extraction & Type-Safe Text Guards
- **Rationale:**
  1. *Fragile & Untyped Text Checking:* Across the codebase, components checked `part.type === "text"` using raw type-casting (`(p as { text: string }).text`), which was prone to runtime errors, code duplication, and lint warnings.
  2. *Loss of Semantic Meaning:* A generic `text` part failed to express what the text represented (e.g. an intermediate plan, a pre-choice prompt, an in-flight progress notice, or a final synthesis). This caused intermediate plans to either leak into main chat bubbles or require artificial hacks like masking as `type: "reasoning"`.
- **Decision:**
  - **Semantic Text Taxonomy (`@my-agent/core/step-frame-types.ts`):** Introduced `TextPartRole` (`plan_rationale`, `decision_prompt`, `progress_notice`, `final_synthesis`) and `SemanticTextPart`.
  - **Zero-Regex Structural Classification:** Completely eliminated regex patterns (`/^[📊🚀...]/`), emoji matching, and Turkish keyword heuristics (`seçin`, `belirtin`, `açılıyor`). Role assignment in `classifyTextPart` is now 100% structural and deterministic based on ReAct execution context (pre-tool text = `plan_rationale`, tool-free text = `final_synthesis`).
  - **Type Guards & Extraction:** Added `isTextPart(part)` and `isReasoningPart(part)` type guards, `classifyTextPart(text, hasTools)` for structural role assignment, and `getMessageText(message, options)` with role filtering/exclusion.
  - **Client-Wide Adoption:** Replaced raw `part.type === "text"` filters and casts in `yula-chat-turn.tsx`, `ai-chat-message.tsx`, `yula-worked-steps.tsx`, `yula-worked-accordion.tsx`, `yula-worked-copy.ts`, `use-chat-turns.ts`, `yula-choice-card.tsx`, `yula-questionnaire-card.tsx`, `yula-execution-terminal.tsx`, `yula-agent-mode-chip.tsx`, `use-history-suggestions.ts`, `chat-shared.ts`, `yula-chat-instance.tsx`, `use-workspace-rag-search.ts`, `context-slim.ts`, `chats.ts`, and `yula-session-dump.ts`.
  - **Bubble vs Accordion Clean Separation:** Chat bubbles exclude `plan_rationale` (which renders cleanly inside the Worked Accordion step cards), while final syntheses render in the message row.
  - **Verification:** 129/129 `@my-agent/core` vitest tests pass, 269/269 `yula.client` tests pass, 0 oxlint warnings/errors, clean typecheck (`tsc --noEmit`), Next.js 16.3.5 Turbopack production build succeeds with 0 errors, and all files strictly comply with the 500-line limit.
- **Author:** Antigravity / Team

---

## [2026-09-21] Text-First Causal Transparency: Context Inspection, Plan Extraction & Decision Flow Diagram Cancellation
- **Rationale:**
  1. *Premature Visual Diagram & Obscure Pre-Action State:* When an agent formulated a plan and presented an interactive user choice (e.g. `ask_user_choice` for store or company code clarification), the visual Mermaid flowchart only showed the solitary final action node (`Adım 1: ask_user_choice`), offering zero insight into what the agent checked or why it made that decision.
  2. *User Direction (Text-First Priority):* The user explicitly instructed to cancel/disable visual diagram generation for decision trees and prioritize rich, structured textual transparency detailing the entire chain of inspection and causal reasoning.
  3. *Discarded LLM Planning Text:* `extractWorkedSteps` previously threw away non-reasoning text parts (`part.type === "text"`), causing pre-tool planning headers, calculated date ranges (e.g. `2026-09-14..2026-09-20`), target report matching, and missing-parameter rationales to disappear from step accordions.
- **Decision:**
  - **Diagram Cancellation:** Removed the "Karar Ağacı" Mermaid trigger button from `YulaWorkedAccordion` (`yula-worked-accordion.tsx`). Decision flows are now rendered natively as structured textual cards.
  - **Context & Screen Inspection Step:** Added `inspection` telemetry to `YulaMessageMetadata` and `/api/agent/chat/route.ts` (`toUIMessageStream`). `extractWorkedSteps` generates a dedicated `🔍 Ekran & Bağlam İncelemesi` step reporting active route, screen phase, mounted form status, target report, and reference date.
  - **Pre-Action Plan & Rationale Extraction:** Enhanced `extractWorkedSteps` (`yula-worked-steps.tsx`) so that whenever text precedes tool executions, it is captured as a `📋 Değerlendirme & Eylem Planı` or `💡 Karar Gerekçesi` thought step with full detail text.
  - **Causal Transition Reasoning:** Enhanced `groupStepsByPhase` to automatically establish `transitionReason` for choices (`Kullanıcı tercihi ve eksik kriter doğrulama adımı`), navigation, field application, job execution, and recovery.
  - **Phase Card UX Enhancement:** Updated `YulaWorkedPhaseCard` (`yula-worked-phase-card.tsx`) to auto-open inspection steps and render formatted multi-line detail text with full readability.
  - **Verification:** 124/124 `@my-agent/core` vitest tests pass, 269/269 `yula.client` tests pass, 0 oxlint warnings/errors, clean typecheck (`tsc --noEmit`), Next.js 16.3.5 Turbopack production build succeeds with 0 errors, and all files strictly comply with the 500-line limit.
- **Author:** Antigravity / Team

---

## [2026-09-21] Retirement of Obsolete Intervention Tools (time_travel, ask_user_question) & Elimination of Artificial Triage Prompts
- **Rationale:**
  1. *Redundant Intervention Tools:* With the deterministic Turn State Machine and inline Steer/Abort controls (`YulaWorkedPhaseCard`), legacy intervention tools such as `time_travel` (Undo/Redo via LLM call) and deprecated functions (`askUserQuestionTool`, `suggestNextStepsTool`) were unnecessary, cluttered the agent's tool loadout, and wasted context window tokens.
  2. *Artificial Triage Prompting:* The system prompt previously contained a convoluted `CRITICAL ERROR TRIAGE & SELF-HEALING PROTOCOL` commanding the LLM to inspect non-existent telemetry properties (`diagnostic.isRecoverable`, `diagnostic.action === "ASK_USER_CHOICE"`).
- **Decision:**
  - **Pruned Obsolete Tools:** Removed `time_travel` from `STANDARD_AGENT_TOOLS` (`standard-agent-tools.ts`), `@my-agent/core` (`standard-tools.ts`, `ui-tool-adapter.ts`), `chat-helpers.ts`, and catalog manifests. Removed deprecated `askUserQuestionTool` and `suggestNextStepsTool` from `interactive-tools.ts` and `client-tools/index.ts`.
  - **Streamlined Causal Recovery Protocol:** Replaced the legacy triage instructions in `yula-agent-prompt.ts` with `CAUSAL ERROR RECOVERY & INTERVENTION PROTOCOL`, instructing the model to analyze root causes, execute intelligent schema/parameter adjustments (matching the State Machine's `isRecovery` flag), ask user choices when unresolvable, and immediately pivot on inline steering.
  - **Verification:** 124/124 `@my-agent/core` vitest tests pass, 266/266 `yula.client` tests pass, 0 oxlint warnings/errors, clean Next.js 16.3.5 Turbopack production build (`next build`), and all files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-21] Causal ReAct Step Frame Architecture, PostgreSQL Telemetry & Live Mermaid Decision Tree
- **Rationale:**
  1. *Opaque LLM Reasoning & Debugging Complexity:* In multi-step agent runs, detecting why tools failed or why subsequent steps were chosen was exceedingly difficult. The agent could not inspect pre-action context, raw tool inputs/outputs, or the causal transition link explaining why Step $N+1$ followed Step $N$.
  2. *Lack of Live Intervention:* Users had no ability to steer or abort an in-flight tool run when observing aberrant trajectories.
  3. *Unpersisted Telemetry:* Turn state and step transitions existed only ephemerally in client memory, lacking durable auditability for post-incident diagnostics.
- **Decision:**
  - **Core Causal Types (`@my-agent/core`):** Introduced `AgentTurnState`, `AgentStepFrame`, and `StepFrameStatus` in `step-frame-types.ts` establishing causal chaining (`parentStepId`, `transitionReason`, `isRecovery`, `preActionContext`). Extended `AgentEvent` with `step_frame_start`, `step_frame_end`, and `state_transition`.
  - **PostgreSQL Telemetry Service (`src/server/db`):** Defined `agentRunsSchema` and `agentStepsSchema` with DAG foreign-key chaining. Built `AgentTelemetryService` (`createRunRecorder`) saving step frames and token counts asynchronously on each `onStepFinish` and `onFinish` in `route.ts`.
  - **Visual Mermaid Decision Tree (`decision-tree-mermaid.ts`):** Implemented automatic DAG generation (`flowchart TD`) linking causal steps with status-based CSS styling (success, error, recovery, running) directly openable in `MermaidCanvasPanel` via `openDecisionTreeDiagram`.
  - **Interactive ReAct Step UI (`yula-worked-phase-card.tsx` & `yula-worked-accordion.tsx`):** Extracted `YulaWorkedPhaseCard` with inline Live Steer & Abort controls, thought disclosure, formatted tool input/output JSON inspection, and causal transition reasoning. Added "Karar Ağacı" header trigger.
  - **Verification:** 124/124 `@my-agent/core` vitest tests pass, 11/11 `yula.client` node tests pass, 0 oxlint warnings/errors, clean typecheck (`tsc --noEmit`), and all files strictly $\le 500$ lines.
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

## [2026-09-21] Streamlined Single-Line Shadcn Choice Cards & Deprecation of Verbose "Gerekçe / Etki" Boxes
- **Rationale:**
  1. *Visual Clutter & Disproportionate Vertical Footprint:* Interactive choices (`ask_user_choice`) rendered oversized multi-level cards with separate "Seç" buttons, descriptive paragraphs, and dedicated gray boxes labeled "Gerekçe / Etki: ...", dominating the chat stream and pushing conversation context out of view.
  2. *Unnecessary Rationale Prompting:* The system prompt previously commanded the agent to ALWAYS generate detailed rationales and justifications for every workflow choice, leading to redundant boilerplate text (e.g. "Rapor alma akışını başlatır; gerekli filtreler ekranda seçilir.").
  3. *Inconsistent UI Standard:* Choice options needed to adhere strictly to the repository's sleek Shadcn UI design patterns as concise, single-line action buttons or chips.
- **Decision:**
  - **Single-Line Shadcn Action Rows (`yula-choice-card.tsx`):** Unified the choice card layout. When options have brief descriptions, each renders as a single-line, full-width Shadcn `Button` (`h-8 w-full justify-between`) displaying the label, inline description (`— description`), and optional badge (`Önerilen` / `Standart`). Clicking anywhere on the row selects it immediately with no redundant nested "Seç" button.
  - **Compact Button Bar for Brief Chips:** For short, non-described choices (binary confirmations, store/company codes), options render as an elegant horizontal flex-wrap bar of Shadcn `Button` chips (`size="sm"` / `h-7`).
  - **Elimination of "Gerekçe / Etki" Boxes:** Completely removed the dedicated "Gerekçe / Etki" block from the UI. Deprecated verbose multi-line rationales across tool schemas in `@my-agent/core` and `yula.client`.
  - **Prompt Protocol Alignment (`yula-agent-prompt.ts`, `yula-ui-skills.ts`):** Updated agent instructions to mandate concise, single-line options and explicitly prohibit verbose multi-line rationales.
  - **Verification:** Oxlint 0 warnings/errors, all 262 unit tests passing, `yula-choice-card.tsx` reduced to 418 lines ($\le 500$).
- **Author:** Antigravity / Team

---

## [2026-09-21] Telemetry Monitor Relocation to Yula Full-Mode Right Detail Panel & Shadcn UI Modernization
- **Rationale:**
  1. *Detached Overlay vs Integrated Canvas:* The previous telemetry monitor opened as an invasive slide-over drawer anchored to the right browser viewport edge, overlaying the active workspace rather than residing within the Yula IDE layout.
  2. *Design Consistency:* The drawer relied on bespoke custom CSS and raw HTML controls rather than the repository's standard Shadcn UI design system.
  3. *Unified Detail Panel:* Yula Fullscreen Overlay needed a flexible, multi-view right detail pane capable of seamlessly hosting both Mermaid diagram canvases and the live telemetry stream with dedicated toggle controls.
- **Decision:**
  - **Unified Right Detail Panel (`yula-fullscreen-overlay.tsx`, `yula-ide-detail-header.tsx`):** Generalized Column 3 into a tabbed detail panel. When both a diagram and telemetry exist, a sleek header switcher allows instant toggling between `Diyagram` and `Telemetri`.
  - **Header Toggle Button (`yula-dock-controls.tsx`):** Added `YulaDetailToggleButton` (`PanelRight` icon) to Column 2's header bar, allowing users to collapse or expand the right detail panel on demand.
  - **MDX Collapsible Stream & Sleek Button Tabs (`telemetry-detail-view.tsx`, `yula-ide-detail-header.tsx`):** Rebuilt telemetry into an elegant developer-log stream with collapsible items (`<Collapsible>`), severity pulse dots, dynamic topic filter tabs hiding zero-count categories, and a unified `panelHeaderClass` segmented button tab bar for Telemetri/Diyagram.
  - **Drawer Retirement (`providers.tsx`, `workspace-ai-dock.tsx`):** Removed `TelemetryMonitorDrawer` and redundant dock buttons. The right detail panel is centrally controlled via `YulaDetailToggleButton` (`PanelRight` icon).
  - **Verification:** 100% clean typecheck (`tsc --noEmit`), 0 oxlint warnings/errors, all 262 tests passing, all modified files strictly $\le 500$ lines.
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

## 📜 Prior Decisions Archive
Older architectural decisions have been archived to adhere to the 500-line limit:
- [Decision Log Archive 2 (.agents/log-archive-2.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-2.md)
- [Decision Log Archive 1 (.agents/log-archive-1.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-1.md)

