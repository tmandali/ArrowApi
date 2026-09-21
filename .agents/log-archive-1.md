# ArrowApi Developer Agent Decision & Evolution Log (Archive 1)

Archived decisions from September 2026 to ensure active documentation files strictly satisfy the 500-line limit.

---

## [2026-09-18] Single-Page Unified Report Flow & SSE Anti-Buffering
- **Rationale:** Separate `[jobId]` pages polluted browser history and triggered full reload overhead on navigation.
- **Decision:**
  - Unified report flow under `src/app/<workspace>/<report>/page.tsx?jobId=<guid>`.
  - Configured backend SSE (`ArrowJobSse.cs`) with anti-buffering headers (`X-Accel-Buffering: no`, `Cache-Control: no-transform`) and immediate response body flushing.
  - Built `ArrowJobEventHub` singleton event dispatcher with visual micro-rhythm (~70ms tempo) on the frontend.
- **Author:** Antigravity / Team

---

## [2026-09-10] Headless React UI-Agent (@my-agent) & Tool Consolidation
- **Rationale:** 20+ fragmented manual tool calls overwhelmed the LLM and caused high token waste and reasoning failures.
- **Decision:**
  - Replaced manual tool loops with `@my-agent/core` and `@my-agent/react` featuring 6 standard tools (`STANDARD_AGENT_TOOLS`).
  - Wrapped interactive components natively via `useAgentComponent` in their own React lifecycle.
  - Strictly banned popup modals; implemented inline interactive choice cards (`YulaChoiceCard` via `ask_user_choice`).
- **Author:** Antigravity / Team

---

## [2026-09-20] Client-Side Pyodide Skills & Event Hub Architecture
- **Rationale:** Executing user-created Python skills or data validation scripts on the server introduces significant RCE security vulnerabilities, complex infrastructure scaling, and PII/KVKK privacy risks. Running Python natively in the browser via WebAssembly provides complete process sandboxing, zero server compute overhead, and aligns with the existing DuckDB WASM architecture.
- **Decision:**
  - Integrated Pyodide WebAssembly in an isolated background thread (`pyodide.worker.ts`) pre-loading `pandas`, `openpyxl`, and `numpy`.
  - Implemented `SkillEventHub` extending native `EventTarget` for streaming pub/sub (`stdout`, `stderr`, `progress`, `snapshot`, `replay`).
  - Added a 30s timeout and crash watchdog calling `worker.terminate()` with seamless worker re-spawn.
  - Implemented `duckdb-pyodide-bridge.ts` allowing direct injection of DuckDB WASM tabular records into Pyodide pandas `df`.
  - Implemented `useSkillStore` with Zustand `persist` supporting local `Draft` authoring and `Released` status for DB syncing.
  - Added public exports under `src/features/skills/index.ts` and UI terminal drawer `SkillTerminalDrawer`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Anthropic Agent Skills (xlsx, pdf, mcp-builder, frontend-design, skill-creator)
- **Rationale:** Equipping the Yula Agent and developers with production-tested domain guidelines for Excel modeling, PDF document extraction, Model Context Protocol server development, distinctive UI design, and meta-skill authoring.
- **Decision:**
  - Added 5 new built-in skills under `src/Sims/yula.client/skills/`: `xlsx`, `pdf`, `mcp-builder`, `frontend-design`, `skill-creator`.
  - Registered all 5 skills into `built-in-skills.ts` and updated `built-in-skills.test.ts`.
  - Linked `xlsx` directly with the Pyodide Web Worker runtime (`openpyxl` & `pandas`).
  - Verified 100% test passing across the test suite (212/212 tests pass).
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Document & Presentation Skills (doc-coauthoring, docx, pptx)
- **Rationale:** Providing the Yula Agent with production guidelines for collaborative technical document authoring (PRDs, specs, ADRs), programmatic Word (.docx) document generation via docx-js, and executive PowerPoint (.pptx) slide deck creation.
- **Decision:**
  - Added 3 built-in skills under `src/Sims/yula.client/skills/`: `doc-coauthoring`, `docx`, and `pptx`.
  - Registered all skills into `built-in-skills.ts` and updated `built-in-skills.test.ts` (11 total built-in skills).
  - Validated test suite passing (212/212 pass) and clean lint/types.
- **Author:** Antigravity / Team

---

## [2026-09-20] Graph-Native (Node & Edge) Documentation Standard with Traversable Neighbor Links
- **Rationale:** Flat textual documentation failed to clearly capture the multi-agent control loops, event-driven reactive bridges, and Human-in-the-Loop (HITL) pause/resume flows in the Yula AI and Arrow ecosystem.
- **Decision:**
  - Established the mandatory **Graph-Native Documentation Standard** in `.agents/standards/graph-documentation-standard.md`.
  - Added Rule 5 to root `AGENTS.md` requiring all architecture and agent workflow documents to define Mermaid topology, Nodes catalog, and Edges with feedback loops.
  - Authored canonical master system graph document in `src/yula-ai/agent.md`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Deterministic Local Development Ports & Instant Shutdown Protocol
- **Rationale:** Stopping local development services previously required exploratory port hunting via `lsof`. Deterministic ports allow immediate single-command termination upon user request ("proje kapat").
- **Decision:**
  - Standardized all default ports in `.agents/standards/dev-operations.md`.
  - Defined the instant shutdown one-liner: `kill -9 $(lsof -ti:56402,3000,5168,7137) 2>/dev/null; pkill -f "dotnet run|next-server|yula.client.*next" 2>/dev/null || true`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Documented Core UI Components & Arrow Jobs .NET Engine
- **Rationale:** The application's presentation layer (VirtualSpreadsheet, Criteria Form, Yula Client) and distributed job engine (`Arrow.Jobs.*`) required explicit centralized architecture guides.
- **Decision:**
  - Created `.agents/architecture/core-ui-components.md` and `.agents/architecture/arrow-jobs-engine.md`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Enforced English-Only Documentation & Evolutive Wiki Protocol
- **Rationale:** LLM tokenizers and instruction-following attention mechanisms perform with higher accuracy in English. Documentation must evolve dynamically with user corrections.
- **Decision:**
  - Added 4th Golden Rule to root `AGENTS.md` enforcing English-only repository documentation and Evolutive Wiki Maintenance Protocol.
  - User-agent conversations remain in Turkish.
- **Author:** Antigravity / Team

---

## [2026-09-21] Strict pnpm Package Manager Enforcement across JS/TS Workspaces
- **Rationale:** The repository transitioned to `pnpm` (`packageManager: pnpm@10.15.1`, `pnpm-lock.yaml`), but lack of explicit prohibition in agent instructions led to occasional fallback invocations of `npm test` or `npx tsc`, triggering `.npmrc` configuration warnings and bypassing pnpm resolution.
- **Decision:**
  - Added Rule 5 to `src/Sims/yula.client/AGENTS.md` strictly requiring `pnpm` (`pnpm test`, `pnpm run typecheck`, `pnpm run lint`) and forbidding `npm` / `npx`.
  - Added Section 3 ("Package Manager & Script Runner Standard") to `.agents/standards/dev-operations.md`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Type-Safe UI Telemetry & Upstream Event Stream Architecture
- **Rationale:**
  1. *Asymmetry between Downstream & Upstream:* While downstream actions (Agent -> UI via `dispatch_component_action`) enjoyed strict Zod preflight contracts, upstream interactions (UI -> Agent) relied on loose strings (`source: string`, `type: string`, `payload?: any`), leading to risk of typos, payload schema discrepancies, and token inflation.
  2. *Single-Lifecycle Ambient Sensing:* Rapor job states and manual UI operations (filter changes, route changes, row selections) needed to stream cleanly into the LLM's ring-buffer memory without cancelable blocking queues or page-churn memory leaks.
- **Decision:**
  - **Core Typings (`@my-agent/core`):** Introduced `AppTelemetryEvent` discriminated union (`app_router`, `arrow_job`, `result_grid`, `criteria_form`), `InferEventPayload<T>`, and `ComponentEventEmitter<TEvents>`. Upgraded `IEventBus.recordTelemetry` to support strongly typed contracts with backward compatibility.
  - **Component Inferred Emitter (`@my-agent/react`):** Enhanced `useAgentComponent` to return `{ emit }` typed against declared `events` Zod schemas.
  - **Application Telemetry Stream (`yula.client`):**
    - `arrow-job-hub-stream.ts`: Emits `arrow_job:REPORT_COMPLETED`, `REPORT_CANCELLED`, and `REPORT_FAILED` on terminal states.
    - `use-headless-system-components.ts`: Emits `app_router:ROUTE_CHANGED` on client navigations.
    - `use-result-grid-agent.ts`: Declares `row_selected`, `filter_change`, and emits filter events automatically when filters mutate.
- **Author:** Antigravity / Team

---

## [2026-09-20] ReAct / Plan Mode Badge, Focus Screen Button, and Event Bus Dedup
- **Rationale:** Triggering confirmation cards when the user is already on the target screen slowed down execution; fullscreen overlay also needed an instant way to focus on the underlying page.
- **Decision:**
  - Screen scope (`/stock/stock-balance`) defaults to **Direct ReAct** mode; global scope (`/`, `/dashboard`) defaults to **Plan-First** mode.
  - Added live status badge (`YulaAgentModeChip`: `ReAct`, `Plan`, `Reasoning…`, `Acting…`) to the side dock and fullscreen header.
  - Added `YulaFocusScreenButton` in fullscreen overlay to collapse the dock and focus on the underlying screen with `USER_FOCUS_SCREEN` telemetry.
  - Added 150ms windowed deduplication and coalescing in `uiEventBus`.
- **Author:** Antigravity / Team

---

## [2026-09-21] ActionContract Canonicalization & StrictActionContract Elimination
- **Rationale:** An extra intermediate type `StrictActionContract` was unnecessary since `@my-agent/core` already defines `ActionContract<TIn, TOut>` with required `whenToCall` and `whenNotToCall`.
- **Decision:**
  - Standardized all system contracts (`app_router`, `criteria_form`, `result_grid:active`, `job_history`, `job-detail-tool`) directly on `@my-agent/core`'s `ActionContract`.
  - Enforced schemas and prompts compile-time safety using `satisfies ActionContract`.
  - Deleted redundant `action-contract-types.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-21] Generic Type-Safe ActionHandlersMap & Approach 2 Standardization
- **Rationale:**
  1. *Action Dispatch Boilerplate & Type Insecurity:* Previously, custom hooks and components handling actions had to implement a generic `onAction: async (action: string, payload: any)` callback containing `switch-case` blocks, defensive `typeof` checks, and manual payload casting. Typos in action names were undetected at compile time.
  2. *Approach 2 (Isolated Custom Binding Hooks) Standard:* Inline `useAgentComponent` in complex UI views led to file bloat (e.g. `ItemFormShell.tsx` was 691 lines).
- **Decision:**
  - **Type Inference Primitives (`@my-agent/core`):** Introduced `InferActionInput<T>`, `InferActionOutput<T>`, and `ActionHandlersMap<TActions>` in `types.ts` to infer input and output types directly from Zod `ActionContract` schemas.
  - **Type-Safe `handlers` in `useAgentComponent` (`@my-agent/react`):** Enhanced `useAgentComponent<TActions, TEvents>` with generic action typing and a strongly typed `handlers?: ActionHandlersMap<TActions>` property. Each action key maps to an async handler receiving automatically inferred payload types (`z.infer<TIn>`) and returning typed results. Backward-compatible fallback to `onAction` is preserved.
  - **100% Approach 2 Adoption across `yula.client`:** Extracted dedicated binding hooks (`useJobExecutionsAgent`, `useStockItemAgent`, `useMySettingsAgent`, `usePluginsAgentBinding`, `useMemoryAgentBinding`) and migrated their actions to the new `handlers` map.
  - **File Size Compliance:** Modularized `ItemFormShell.tsx` from 691 lines down to 404 lines ($\le 500$).
- **Author:** Antigravity / Team

