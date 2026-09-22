# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

## [2026-09-23] Demo App Showcase for Pi Harness Capabilities: ERP Benchmark Runner & Interactive Session Tree
- **Rationale:**
  1. *Visualizing Advanced Harness Features:* After implementing Session Tree (branching, forking, diffing) and the 12 Enterprise ERP Benchmark Suite in `@my-agent/core`, the `demo-app` lacked UI controls to interactively test, showcase, and verify these features live.
  2. *Evaluation Suite Selection:* `EvalsRunnerView` was previously hardcoded to only run 10 basic UI agent tests, ignoring kurumsal ERP safety guardrails and negative constraints.
  3. *Branch Tree Interaction:* `SessionsTab` only presented flat checkpoints and linear Undo/Redo without exposing branch creation (`fork`), branch switching, or genealogical ancestry.
- **Decision:**
  - **Enhanced `EvalsRunnerView.tsx`:** Added suite switcher tabs (`🏢 Kurumsal ERP Benchmark (12 Test)` vs `🖥️ Temel UI Ajanı (10 Test)`). Integrated `erpEnterpriseEvalSuite` running procurement, inventory, DuckDB SQL guard, Arrow Jobs, and financial guardrail scenarios with categorized badge cards (`🛡️ Güvenlik Bariyeri` vs `⚡ Pozitif Aksiyon`).
  - **Enhanced `SessionsTab.tsx`:** Added interactive Session Tree controls: branch switcher pills with checkpoint counts, "➕ Yeni Dal Aç (Fork)" input form, genealogical ancestry breadcrumb (`Soy Kütüğü: main ➔ senaryo-1`), and active branch checkpoint tracking with live restoration.
  - **Subscribed `AgentWidget.tsx`:** Synchronized `sessionManager.subscribe` directly into the widget to react to fork/switch events seamlessly.
- **Verification:**
  - 23/23 `@my-agent/core` test files passed (188 tests).
  - 94 `yula.client` test suites passed (372 tests).
  - Demo-app build succeeded in 1.16s (`tsc && vite build`).
  - All files strictly adhere to `wc -l <= 500` (`EvalsRunnerView`: 254 lines, `SessionsTab`: 294 lines, `AgentWidget`: 265 lines).
- **Author:** Antigravity / Team

---

## [2026-09-23] Advanced Pi Capabilities Integration: Hierarchical Session Tree, Durable Task Recovery, Node 22 SQLite & ERP Evals (@my-agent/core)
- **Rationale:**
  1. *Session Branching & What-If Lineage:* Previously, session checkpointing supported flat undo/redo without genealogical tree parentage (`parentBranchId`), fork points (`forkPointId`), tree visualization, or branch diff/merge capabilities.
  2. *Transient Long-Running Operations:* Background jobs (Arrow Jobs, DuckDB WASM ingests, large report exports) were held purely in volatile memory. Browser refresh or crash caused catastrophic task loss without recovery.
  3. *Zero-Dependency Native Server Storage:* Moving session persistence to the server required a fast, zero-dependency, crash-safe ACID SQLite engine matching Node 22's native `node:sqlite` capabilities.
  4. *Enterprise ERP Evaluation & Guardrails:* Validating UI-Agent compliance required a standardized benchmark suite combining AgentArch (`C(r) * A(r) * O(r)`), positive actions, and negative safety guardrails (destructive SQL, authorization limits, closed accounting periods).
- **Decision:**
  - **Hierarchical Session Tree (`harness/session/session-branch.ts`):** Added `parentBranchId`, `forkPointId`, and `metadata` to `SessionBranch`. Implemented `getBranchTree()`, `getBranchAncestry()`, `diffBranches()`, and `mergeBranch()` (squash & fast-forward).
  - **Durable Task Recovery (`harness/runtime/durable-lane.ts`):** Implemented `DurableLaneManager` with checkpointed progress, memoization, idempotency keys, abort signal management, crash recovery (`recoverInterruptedTasks`), and wired `harness.runtime.durable` on `AgentHarness`.
  - **Node 22 Native SQLite Driver (`server/sqlite-session.ts`):** Implemented `SqliteSessionDriver` using `node:sqlite` (`DatabaseSync`), providing WAL-mode ACID session dump and checkpoint persistence without third-party dependencies.
  - **Enterprise ERP Benchmark Suite (`harness/extensions/erp-eval-cases.ts`):** Created 12 real-world enterprise test cases evaluating procurement, inventory, DuckDB, ArrowJobs, and financial controls under strict AgentArch metrics.
- **Verification:**
  - 23/23 test suites passed (188 tests in `@my-agent/core`).
  - 94 suites passed (372 tests in `yula.client`).
  - Monorepo typechecks cleanly with zero errors.
  - All touched source, test, and documentation files strictly respect `wc -l <= 500`.
- **Author:** Antigravity / Team

---

## [2026-09-23] Unified AgentHarness Facade & Lifecycle Coordination (@my-agent/core)
- **Rationale:**
  1. *Subsystem Coordination Overhead:* Following Phase 1 harness modularization, consumers and tests were forced to coordinate 8 separate singletons independently (`sessionHarness`, `multiLaneScheduler`, `compactConversation`, `uiEventBus`, `uiRegistry`, `telemetryTracker`, `skillsManager`, `playbookManager`).
  2. *Alignment with Reference-Pi AgentHarness Pattern:* Reference-Pi (`reference-pi/packages/agent/src/harness/agent-harness.ts`) utilizes a unified `AgentHarness` controller providing typed access to all subsystems, session snapshots, and automated diagnostic health checks.
- **Decision:**
  - **Unified `AgentHarness` Facade (`harness/agent-harness.ts`):** Implemented `AgentHarness` class and `agentHarness` singleton aggregating `session`, `runtime`, `compaction`, `ui`, `tools`, `knowledge`, `telemetry`, and `extensions`.
  - **Coordinated Operations:** Added `dump()`, `restore()`, `reset()`, `getHealthReport()`, and `exportAuditReport()`.
  - **AgentSession Integration (`agent-session.ts`):** Exposed `session.harness` and accepted optional `harness` parameter in `AgentSessionConfig`.
  - **Graph Topology Standard Compliance:** Updated `src/yula-ai/agent.md` Mermaid system graph and Node Catalog with `AgentHarnessNode` and modular subsystem layers.
- **Verification:**
  - 19/19 test suites passed (157 tests in `@my-agent/core`).
  - Full monorepo typecheck passed cleanly (`pnpm -r typecheck`).
  - Demo app production build succeeded (`pnpm --filter demo-app build`).
  - All source and documentation files strictly adhere to `wc -l <= 500`.
- **Author:** Antigravity / Team

---

## [2026-09-23] Harness Architecture Refactor & Sub-System Layering (@my-agent/core)
- **Rationale:**
  1. *Flat File Congestion:* Previously, `packages/agent-core/src/` contained ~50 files directly in a flat directory, obscuring subsystem boundaries, complicating navigation, and threatening the 500-line limit.
  2. *Alignment with Reference-Pi Harness Architecture:* `reference-pi/packages/agent/src/harness/` demonstrated an elegant, modular subsystem structure (`session/`, `runtime/`, `compaction/`, `tools/`, `ui-bridge/`, `knowledge/`, `telemetry/`, `extensions/`).
  3. *UI-Agent Isomorphic Purity:* While Pi includes coding-agent file/CLI tools (`write.ts`, `node:fs`, `bash`), Yula AI is strictly a domain-agnostic Headless React UI-Agent runtime. Subsystems were cleanly segregated to guarantee zero Node.js built-in leakage into client bundles while isolating server configs under `src/server/`.
  4. *Zero Breaking Changes Guarantee:* Public entrypoints (`src/index.ts` and `src/server.ts`) preserve 100% contract compatibility, requiring zero modifications in consuming workspaces (`yula.client`, `@my-agent/react`, `demo-app`).
- **Decision:**
  - **Modular Subsystem Skeletons (`packages/agent-core/src/harness/`):**
    - `session/`: `session-harness.ts`, `session-branch.ts`, `session-replay.ts`, `memory.ts`, `indexeddb-storage.ts`, `cbor-codec.ts`.
    - `runtime/`: `execution-queue.ts`, `effect-gate.ts`, `retry.ts`, `reconcile.ts`, `deferred.ts`, `mutation-line.ts`, `lanes.ts`, `isolated-runner.ts`, `progress.ts`.
    - `compaction/`: `compaction.ts`, `truncate.ts`.
    - `ui-bridge/`: `event-bus.ts`, `component-registry.ts`, `vision-bridge.ts`.
    - `tools/`: `standard-tools.ts`, `dynamic-tools.ts`, `ui-tool-adapter.ts`, `ui-delegation.ts`, `server-tools.ts`.
    - `knowledge/`: `skills.ts`, `prompt-templates.ts`, `playbook.ts`, `playbook-graph.ts`, `playbook-storage.ts`, `model-catalog.ts`.
    - `telemetry/`: `telemetry-metrics.ts`, `pi-event-stream.ts`, `event-stream.ts`, `diagnostic-triage.ts`, `export-html.ts`.
    - `extensions/`: `hooks.ts`, `plugins.ts`, `evals.ts`, `rpc-protocol.ts`, `adaptive-publisher.ts`, `i18n.ts`.
    - `server/`: `auth.ts`, `models-config.ts`, `oauth/`.
  - **Submodule Barrels:** Created typed `index.ts` in each harness directory and master `src/harness/index.ts`.
  - **Preserved Public API Barrels:** `src/index.ts` re-exports all harness subsystems and core types; `src/server.ts` re-exports server components.
- **Verification:**
  - 18/18 test suites passed (151 tests in `@my-agent/core`).
  - `pnpm -r typecheck` passed cleanly across all packages (`@my-agent/core`, `@my-agent/react`, `demo-app`).
  - `pnpm --filter demo-app build` succeeded with zero errors.
  - `pnpm -r test` succeeded.
  - All files strictly adhere to the 500-line ceiling rule (`wc -l`).
- **Author:** Antigravity / Team

---

## [2026-09-23] Skill-Metadata (Progressive Disclosure) & Fail-Closed before_tool Hook Pattern (@my-agent/core)
- **Rationale:**
  1. *Prompt Bloat & Token Inefficiency:* Previously, `SkillRegistry.formatSkillsPrompt` injected complete instructions of all active skills into the LLM system prompt, overflowing context windows and degrading attention as screens multiplied.
  2. *Missing Declarative Governance:* Skills lacked metadata for policy enforcement (`riskLevel`, `requiresApproval`, `requiredFields`).
  3. *Domain-Agnostic Purity Violation:* Default skills in `agent-core/src/skills.ts` contained ERP-specific terms (`storeId`, `Kadıköy`, `sales-report-workflow`).
  4. *Hook Arg Loss & Fail-Closed Gap:* `beforeToolCall` in `agent-loop.ts` did not forward rewritten/sanitized arguments to `tool.execute`, and throwing hooks were not guaranteed to fail-closed.
- **Decision:**
  - **SkillMetadata Contract (`skills.ts`):** Added specification-compliant metadata (`name`, `description`, `applicableRoutes`, `applicableComponents`, `requiresApproval`, `riskLevel`, `requiredFields`, `disableModelInvocation`, `metadata`). Added strict name/description validators per Pi reference.
  - **Progressive Disclosure:** Implemented `formatSkillsSummaryPrompt` (emits lightweight XML metadata tags only) and `formatSkillContent` for on-demand lazy loading.
  - **Standard Tool `read_skill_guide` (`standard-tools.ts`):** Added standard tool enabling the model to retrieve full skill instructions dynamically when executing a matched task.
  - **Declarative Policy Hook (`installSkillPolicyHook`):** Automatically intercepts `dispatch_component_action` calls via `hookPipeline.beforeToolCall` to enforce `requiredFields` and trigger HITL hold on `requiresApproval` or `riskLevel: 'high'` actions unless approved.
  - **Fail-Closed Execution & Arg Rewriting (`agent-loop.ts`, `agent-loop-types.ts`):** `agent-loop` catches throwing `beforeToolCall` hooks as terminal tool blocks (fail-closed) and cascades rewritten `effectiveArgs` downstream to `tool.execute`.
  - **Domain-Agnostic Purification:** Replaced ERP defaults in `skills.ts` with pure UI skill guides (`form-submission-guide`, `validation-recovery-guide`, `table-interaction-guide`), relocating demo ERP skills to `apps/demo-app/src/skills/salesReportSkill.ts`.
- **Verification:**
  - 18/18 test suites passed (151 tests in `@my-agent/core`, including 10 new tests in `skills.test.ts` and 2 in `agent-loop.test.ts`).
  - Full monorepo typecheck passed (`pnpm -r typecheck`).
  - Demo app built successfully (`pnpm --filter demo-app build`).
  - All files strictly adhere to the 500-line ceiling rule (`skills.ts`: 307, `agent-loop.ts`: 488, `standard-tools.ts`: 487).
- **Author:** Antigravity / Team

---

## [2026-09-22] Assistant Message Hover Action Toolbar & Programmatic Navigation Actions (Zero-Hallucination ReAct Links)
- **Rationale:**
  1. *Probabilistic Navigation Formatting:* Expecting the LLM to format internal route links (`navigateTo`) into Markdown links within free-form text introduced hallucination risks (truncated GUIDs, broken parameters, or missing links when the LLM summarized tersely, e.g., "Raporunuz hazır").
  2. *Clean Separation of Concerns:* The LLM should remain focused on natural conversational summaries without being burdened by link generation syntax or Zod output schema constraints in multi-step ReAct loops.
  3. *Consistent Action Affordance:* Modern AI interfaces provide hover action bars on assistant turns (Copy, Open target, etc.) to give deterministic, type-safe shortcuts.
- **Decision:**
  - **Assistant Message Container (`group/assistant` in `yula-chat-turn.tsx`):** Wrapped assistant text rendering in an interactive group with `YulaAssistantActions`.
  - **Programmatic Navigation Action Extraction (`yula-chat-turn-helpers.tsx`):** Added `extractNavigationAction(toolParts)` to deterministically extract `navigateTo`, `title`, and `jobId` from successful tool outputs (such as `OPEN_LAST`, `findMatchingReport`, and `NAVIGATE`).
  - **Hover Action Toolbar (`yula-assistant-actions.tsx`):** Renders a responsive action bar (hover on desktop, subtle on mobile) featuring a dedicated `[ExternalLink: <Title>]` button when `navigateTo` is present (and no active `YulaJobStartedCard` is mounted), alongside a response copy button.
  - **Action Contract Alignment (`job-history-contracts.ts` & `report-execution-tools.ts`):** Added `title` to `JOB_OPEN_LAST_ACTION_CONTRACT` outputSchema and `openLastReportTool` return payload.
  - **Localization (`tr.json`, `en.json`):** Added `copy_reply`, `copied`, and `open_target` keys to `ChatTurn`.
- **Verification:**
  - All 357 `yula.client` unit tests passed (90 suites, 0 failures).
  - Oxlint passed with 0 warnings and 0 errors on 798 files.
  - `check:i18n` passed.
  - All modified files remain strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

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

## 📜 Prior Decisions Archive
Older architectural decisions have been archived to adhere to the 500-line limit:
- [Decision Log Archive 3 (.agents/log-archive-3.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-3.md)
- [Decision Log Archive 2 (.agents/log-archive-2.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-2.md)
- [Decision Log Archive 1 (.agents/log-archive-1.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-1.md)
