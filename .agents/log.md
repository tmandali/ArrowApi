# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

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

## [2026-09-20] Grounded ERP Workflow Protocol & Procedural Memory (Eliminating Theoretical LLM Fallback)
- **Rationale:**
  1. *Theoretical Parametric Fallback:* When a user asked about multi-step enterprise workflows (such as purchasing order creation, approvals, goods receipt, and invoicing), the LLM lacked verified procedural recipes in the workspace wiki. Governed by a generic rule ("Answer general conceptual questions directly"), the model fell into parametric training memory and generated generic textbook theories ("Talep açılır -> Tedarikçi seçilir -> Fatura ödenir") completely detached from actual Sims ERP screens, routes, and business rules.
  2. *Missing Level 0 Recipe Discovery:* `chat/route.ts` pre-injected `playbookRules` (screen guidelines), but omitted `playbookRecipes` from Level 0 system prompt context, forcing extra search turns.
  3. *Lack of Proactive Playbook Learning:* When no company-specific recipe was found, the model failed to offer interactive Human-In-The-Loop learning chips (`ask_user_choice`) to record the company's real DAG workflow via `propose_playbook_update`.
- **Decision:**
  - **Prompt Grounding & Directives (`yula-agent-prompt.ts`):** Replaced the generic conceptual exception with the **Grounded Workflow Protocol**:
    - For ERP workflow and operational procedure queries, ungrounded textbook essays and theoretical diagrams detached from Sims ERP are strictly forbidden.
    - If a verified recipe exists, present its concrete DAG steps and screen routes.
    - If no verified recipe exists (Anti-Confabulation / Grounded Fallback): transparently state that no verified company recipe exists, ground the response in actual Sims ERP modules and screen routes (`stock`, `selling`, `accounting`, `manufacturing`, `subcontracting`), and proactively offer interactive `ask_user_choice` chips (`['Playbook Reçetesi Oluştur', 'İlgili Ekrana Git', 'Vazgeç']`).
    - Added the Sims Available Enterprise Modules catalog to Level 0 context.
  - **Zero-Latency Recipe Discovery (`chat/route.ts`):** Added pre-injection of `playbookRecipes` using `serverPlaybookStorage.readEntries(wsId)` so existing workflow recipes are visible to the agent in Level 0 with 0 ms latency.
  - **Frontmatter Parsing Hardening (`playbook-server.ts`):** Stripped surrounding quotation marks from `category` and `targetPath` frontmatter attributes to ensure strict enum matching (`workflow_recipe`).
  - **Core Tool Binding (`ui-tool-adapter.ts`):** Fixed missing `playbookManager` import in `@my-agent/core` ui tool adapter.
  - **Baseline Recipe & Catalog:** Added `recipe-purchasing-flow.md` and initialized `index.md` in `storage/wiki/workspaces/stock/`.
  - **Simulation & Verification:** Added `yula-workflow-grounding.simulation.test.ts` (4/4 pass) and expanded `yula-agent-prompt.test.ts` (18/18 pass). All simulation suites pass (31/31).
- **Author:** Antigravity / Team

---

## [2026-09-20] Multi-Step ReAct Isolation & Tool Loadout Synchronization (Pi DAG Message Model & Server-Client Tool Bridge)
- **Rationale:**
  1. *Duplicate Visual Artifacts & Preamble Pollution:* In multi-step turns (where the model executed tools before formulating its terminal response), intermediate assistant preambles and draft Mermaid diagrams were concatenated with the terminal response because `computeChatTurns` merged all assistant message parts using `flatMap`.
  2. *Tool Loadout Desynchronization (`query_playbook` missing in client adapter):* `STANDARD_AGENT_TOOLS` on the server and `yula-agent-prompt.ts` included `query_playbook` and `propose_playbook_update`, but `createStandardAgentTools()` in `@my-agent/core/ui-tool-adapter.ts` omitted them, causing an immediate `Tool "query_playbook" not found.` error and triggering an unnecessary fallback recovery turn (resulting in 11-second turn latencies).
  3. *Premature Tool Execution Bridge:* `chat-stream-fn.ts` intercepted server-streamed `tool-input-available` chunks and prematurely terminated the stream with `stopReason: 'tool_use'`, claiming client execution authority even when the server was already executing the tool.
  4. *Unconstrained Pre-Tool Synthesis:* The system prompt previously lacked a strict negative constraint forbidding visual artifact and diagram generation in intermediate tool-invoking steps.
- **Decision:**
  - **Pi DAG Presentation Layer (`use-chat-turns.ts`):** Implemented `buildTurnAssistantMessage` following Pi's message DAG model. The visible chat bubble now strictly extracts text parts exclusively from the terminal assistant message. Any intermediate assistant text generated prior to tool invocations is demoted to `reasoning` (`meta: "intermediate_plan"`) so it is preserved inside the `WorkedSteps` accordion without polluting the user-facing response bubble.
  - **Tool Adapter Synchronization (`ui-tool-adapter.ts`):** Registered `query_playbook` and `propose_playbook_update` in `createStandardAgentTools()` using `playbookManager`, ensuring 1:1 parity between prompt capabilities and local agent loop tools.
  - **Hybrid Server/Client Tool Bridge (`chat-stream-fn.ts`):** Added handlers for server-completed tool chunks (`tool-output-available`, `tool-result`, and AI SDK `a:` protocol). Server-executed tools are removed from the client's pending execution list so the client agent loop does not attempt to re-execute them locally.
  - **Prompting Directives (`yula-agent-prompt.ts`):** Added the `SINGLE FINAL SYNTHESIS & NO PRE-TOOL ARTIFACTS` directive forbidding Mermaid diagrams in pre-tool steps, and clarified that general conceptual ERP inquiries must be answered directly without triggering unnecessary playbook queries.
- **Author:** Antigravity / Team

---

## [2026-09-20] Typed Component & Action Contracts: Dual Schema Support (Input/Output), Emitted Events, and Deterministic Conditions
- **Rationale:**
  1. *Action Contract Schema Ambiguity:* `ActionContract.schema` was previously an input payload schema only, leaving return values untyped and unvalidated, and missing output introspection for tool-calling agents.
  2. *Component Event Visibility:* UI components emitted events over `uiEventBus` (e.g. `field_change`, `filter_changed`, `job_queued`, `view_transformed`), but had no formal schema declaration for inspection or observability by agent tools like `inspect_ui_state`.
  3. *Deterministic Guarding vs LLM Reasoning:* While natural language directives (`whenToCall` & `whenNotToCall`) are critical for LLM prompt reasoning, engine-level deterministic preflight conditions (`when?: ActionCondition`) were needed to prevent invalid action dispatches (e.g., executing grid actions when in criteria form phase).
- **Decision:**
  - **Core Types (`@my-agent/core`):**
    - Added `ActionCondition` (`route?: string`, `phase?: string`, `custom?: (ctx) => boolean`).
    - Added `EventContract` (`schema?: ZodTypeAny`, `description: string`, `whenEmitted?: string`).
    - Enhanced `ActionContract` with `inputSchema` (aliasing `schema` for 100% backward compatibility), `outputSchema`, and `when?: ActionCondition`.
    - Enhanced `ComponentSchema` with `events?: Record<string, EventContract>`.
    - Added `postflightValidate` to `IComponentRegistry` for verifying action results against `outputSchema`.
  - **Prompt & Registry Formatting (`component-registry.ts`):**
    - Enforced deterministic `when` condition checking in `preflightValidate`.
    - Enhanced `formatActiveComponentsPrompt` to cleanly format `Parameters:`, `Returns:`, and `Emitted Events:`.
  - **React Hook Layer (`@my-agent/react`):**
    - Enhanced `UseAgentComponentOptions` and `useAgentComponent` to accept and register typed `events`.
  - **Application Migration (`Sims/yula.client`):**
    - Added typed `outputSchema` and `events` across `criteria_form:*` (in `use-screen-agent-context.tsx`, `use-headless-system-components.ts`, and `yula-active-components.ts`) and `result_grid:active` (in `use-result-grid-agent.ts` and `yula-active-components.ts`).
    - Enhanced `inspect_ui_state` tool's `outputSchema` with typed `recent_events` Zod schema.
    - Extracted `useResultGridAgent` and `renderReportGridSubtitle` from `arrow-report-grid.tsx` to maintain clean separation and strictly adhere to the 500-line limit (486 lines).
- **Author:** Antigravity / Team

---

## [2026-09-20] Modernization of Yula.Client Flows & Removal of Legacy Custom Workarounds
- **Rationale:**
  1. *Prompt Bloat & Redundant Defensive Warnings:* Previously, without dynamic tool pruning (`prepareStep`) and native loop termination (`stopWhen: [hasToolCall("ask_user_choice")]`), system prompts had to explicitly forbid calling criteria forms when unmounted, forbid asking multiple questions, and forbid duplicate tool calls.
  2. *Untyped Client Tools:* While server tools had Zod `outputSchema`, client-executed tools (`dispatch_component_action`, `inspect_ui_state`, `ask_user_choice`, `time_travel`) lacked formal output schemas.
  3. *Arbitrary Sliding Window in Transport Slimming:* `context-slim.ts` previously truncated conversations at 16 messages and cut rows at 800 chars regardless of actual token consumption.
  4. *Component Mount/Unmount Desynchronization:* Active UI components mounted/unmounted without broadcasting explicit `tool_loadout_updated` events to the Pi event stream.
- **Decision:**
  - **Prompt Streamlining (`yula-agent-prompt.ts`):** Removed redundant duplicate tool call prohibitions and defensive prompt walls, relying on engine-level `prepareStepRouting` and `stopWhen`.
  - **Client Tool Output Schemas (`standard-agent-tools.ts`):** Added explicit Zod `outputSchema` definitions to `dispatch_component_action`, `inspect_ui_state`, `ask_user_choice`, and `time_travel`.
  - **Deprecation of Manual Deduplication (`yula-tool-info.ts`):** Deprecated `findDuplicateQuestionCallIds` as native `stopWhen` stops the loop after 1 choice prompt.
  - **Transport Window Consolidation (`context-slim.ts`):** Relaxed arbitrary 16-message transport cutoff to safety-net levels, delegating fine-grained compaction to SDK-native `pruneMessages` inside `prepareStepRouting`.
  - **Tool Loadout Delta Broadcast (`use-agent-component.ts` & `use-screen-agent-context.tsx`):** Connected `piEventStream.emit({ type: 'tool_loadout_updated', added, removed })` on component mount and unmount.
- **Author:** Antigravity / Team

---

## [2026-09-20] Upgrading Yula AI with Reference-Pi Patterns & Vercel AI SDK Best Practices (Dynamic Routing, Tool Deltas, Failover, Output Schemas)
- **Rationale:**
  1. *Tool Hallucination & Token Waste:* Providing full tool definitions across all execution phases caused prompt bloat and allowed models to attempt grid SQL queries before data was loaded.
  2. *Unannounced Tool Loadout Transitions:* As UI components mounted/unmounted across routes, models lacked explicit visibility into loadout deltas, causing unmounted tool invocation errors.
  3. *Cloud Provider Outage & Rate Limits:* When Azure OpenAI or primary models returned 429 Rate Limits or 503 Service Unavailable, agent requests failed without transparent failover.
  4. *Untyped Tool Outputs:* Server tools previously lacked formal Zod output schemas, reducing client-side runtime validation confidence.
- **Decision:**
  - **Dynamic Step Routing (`src/Sims/yula.client/src/lib/yula-step-router.ts`):** Integrated `prepareStepRouting` into Vercel AI SDK `prepareStep` to dynamically prune tools based on screen phase and manage token compaction cleanly under the 500-line limit.
  - **Tool Output Schemas (`src/Sims/yula.client/src/lib/server-tools/standard-agent-tools.ts`):** Added explicit Zod `outputSchema` definitions to `remember_fact`, `recall_fact`, `query_playbook`, and `propose_playbook_update`.
  - **Pi Tool Loadout Delta (`packages/agent-core/src/agent-loop.ts`):** Added `declareToolChanges` to detect added/removed tools between turns and inject transparent system notifications (`[Tools Loadout Updated]`).
  - **Adaptive Model Cascading (`prepareNextTurn` in `agent-loop.ts` & `agent.ts`):** Added Pi-style `prepareNextTurn` support enabling turn-to-turn dynamic model promotion and thinking level adjustments.
  - **Provider Resilience & Failover (`src/Sims/yula.client/src/lib/yula-provider-failover.ts`):** Implemented `createFailoverLanguageModel` using AI SDK `wrapLanguageModel`, seamlessly switching from primary (e.g. Azure OpenAI) to secondary fallbacks (OpenAI / Agnes) on 429/5xx errors.
  - **Interactive Simulation Harness (`apps/demo-app`):** Implemented `useAdvancedArchitecturalSimulations.ts` and updated `PiTestPanel.tsx` / `PiDiagnosticsView.tsx` with 4 interactive test scenarios (Tool Loadout Delta, Model Cascading, Provider Failover, Dynamic Step Routing).
- **Author:** Antigravity / Team

---

## [2026-09-20] Architectural Dual-Layer Localization: Library-Agnostic i18n Dictionary vs Application Next-Intl
- **Rationale:**
  1. *Core Library Invariance:* Hardcoded Turkish string checks (e.g., `key === 'yardim' || key === 'yardım'`) in `@my-agent/core` and Turkish-only response messages in `@my-agent/react` (`chat-commands.ts`) violated the architectural principle that core agent libraries must be domain-agnostic and language-neutral by default.
  2. *Application UI Localization:* Hardcoded Turkish quick prompts and strings in `yula.client` (`blank-workspace-landing.tsx`, `use-skill-agent-binding.ts`, `use-agent-management-binding.ts`, `use-system-users-agent-binding.ts`, `use-playbook-agent-binding.ts`, `my-settings-form.tsx`, `memory-tab-view.tsx`, `plugins-tab-view.tsx`) caused inconsistent multilingual experiences when switching between English and Turkish.
- **Decision:**
  - **Library Layer (`@my-agent/core` & `@my-agent/react`):**
    - Extended `AgentDictionary` with `commandAliases` and `commandResponses`.
    - Fully populated localized command dictionaries in `trDictionary` and `enDictionary`.
    - Dynamic alias resolution in `prompt-templates.ts`: canonical commands are registered once in English, and locale-specific aliases are bound dynamically via `i18nManager.getDictionary()`.
    - Removed hardcoded strings in `chat-commands.ts`; command responses now resolve dynamically from `i18nManager.getDictionary().commandResponses`.
  - **Application Layer (`src/Sims/yula.client`):**
    - Standardized all `quickPrompts` passed to `useScreenAgentContext` to use `next-intl` (`useTranslations`).
    - Added comprehensive prompt message keys across `WorkspaceLanding`, `SystemUsers`, `MySettings`, `AgentManagement`, `SkillManagement`, `Playbooks`, and `Studio` in both `tr.json` and `en.json`.
    - Enforced this architectural rule in `.agents/standards/frontend-rules.md` and `.agents/architecture/headless-react-agent.md`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Decoupling Built-in Slash Commands (Library Runtime) vs Application Tools (Yula Client)
- **Rationale:** When executing `/yardim skil create` or typing `/yardım` (dotless-i), the command leaked past `@my-agent/core` into `/api/agent/chat` because `/yardım` was not recognized as a registered system command. Consequently, the backend LLM invoked the `ask_user_choice` tool to ask what the user meant while simultaneously rejecting it, whereas `yula-worked-steps.tsx` synthesized an artificial `slash_command (status: ok)` step.
- **Decision:**
  - **Core Library (`@my-agent/core`):** Added `normalizeCommandToken` to normalize Turkish character variants (`ı` vs `i`, case-folding). Explicitly registered `/yardım` as an alias alongside `/yardim` and `/help`.
  - **Client Hook (`@my-agent/react`):** Enhanced `handleBuiltInCommand` in `chat-commands.ts` so that `/help` and `/yardim`/`/yardım` commands—even with argument hints (e.g. `/yardim model` or `/yardim skil create`)—are filtered and resolved 100% locally on the client and always return `true`, completely preventing unintended forwarding to the LLM backend.
  - **Application UI (`yula.client`):**
    - Updated `yula-commands.ts` to include `phase` in `parseYamlCommands` and normalize Turkish characters in `resolveYulaSlashCommand` and `matchYulaCommands`.
    - In `yula-worked-steps.tsx`, excluded `phase === "system"` commands from synthesizing fake tool steps in server turn transcripts, and ensured error states accurately reflect tool failure.
- **Author:** Antigravity / Team

---

## [2026-09-20] Migration of Management Screens & Dashboards to useScreenAgentContext and entity_form:* Dynamic Tool Binding
- **Rationale:** On screens like `/my/skills`, when a user asked contextual questions such as *"bu skili nasıl test ederim"*, Yula hallucinated unrelated ERP/stock report test instructions because the screen lacked both screen context and dynamic tool registration. The system prompt defaulted to global orchestration mode and injected irrelevant sample report catalog prompts.
- **Decision:**
  - **Controlled Tab Navigation Support:** Added `activeTab` and `onTabChange` to `TabbedDetail` (`tabbed-detail.tsx`), and forwarded them via `ManagementPageTemplate` (`management-page-template.tsx`) so agents can programmatically switch tabs and inspect tab states.
  - **Dedicated Hook Extraction Pattern:** To maintain strict adherence to Golden Rule 2 (500-line ceiling), created dedicated binding hooks (`use-skill-agent-binding.ts`, `use-agent-management-binding.ts`, `use-playbook-agent-binding.ts`, `use-system-users-agent-binding.ts`).
  - **Full Management & Settings Coverage:**
    - Integrated `entity_form:skill_editor` into `SkillManagementView.tsx` (`/my/skills`, `/system/skills`).
    - Integrated `entity_form:agent_editor` into `AgentManagementView.tsx` (`/my/agents`, `/system/agents`).
    - Integrated `entity_form:playbook_manager` into `playbooks-management-view.tsx` (`/my/playbooks`).
    - Integrated `entity_form:user_settings` into `my-settings-form.tsx` (`/my/settings`).
    - Integrated `entity_form:plugin_registry` into `plugins-tab-view.tsx` (`/my/plugins`).
    - Integrated `entity_form:agent_memory` into `memory-tab-view.tsx` (`/my/memory`).
    - Integrated `entity_form:system_users` into `SystemUsersView.tsx` (`/system/users`), refactoring its guests tab into `SystemUsersGuestsTab.tsx`.
  - **Workspace Dashboard Context Grounding:** Integrated `useScreenAgentContext` into `blank-workspace-landing.tsx` across all domain modules (`/stock`, `/accounting`, `/selling`, `/manufacturing`, `/subcontracting`), supplying module titles, descriptions, and contextual quick prompt chips.
- **Author:** Antigravity / Team

---

## [2026-09-20] Integration of Library Built-in System Commands into Yula Slash Palette
- **Rationale:** The `@my-agent/core` runtime engine and `@my-agent/react` chat hook implement core built-in commands (`/plan`, `/compact`, `/model`, `/help`/`/yardim`, `/new`/`/yeni`), but these were previously absent from `yula.client`'s `system.agent.yaml` slash palette manifest, preventing discoverability and autocomplete for end users.
- **Decision:**
  - **Manifest Registration:** Added `/plan`, `/compact`, `/model`, and `/yardim` to `system.agent.yaml` with explicit icons (`ListTodo`, `Minimize2`, `Cpu`, `HelpCircle`).
  - **Icon Resolution:** Expanded `ICON_MAP` in `yula-commands.ts` with the new Lucide icons.
  - **I18n Localization:** Localized labels, descriptions, and prompts across `tr.json` and `en.json`.
  - **Dual-Language Core Aliases:** Registered `/yeni` and `/yardim` aliases alongside `/new` and `/help` in `prompt-templates.ts` and `chat-commands.ts`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Removal of Legacy Prototype Test Slash Commands & Emptying Skills Seed
- **Rationale:** Following the integration of official Anthropic agent skills (`xlsx`, `pdf`, `docx`, `pptx`, `frontend-design`, `mcp-builder`, `skill-creator`, `doc-coauthoring`), the legacy prototype skills (`/ay-kapanis`, `/sayim-fark`, `/rapor-kalite`, `/gunluk-ozet`) and mock template commands (`/rapor`, `/sirala`, `/csv`, `/geri` in `@my-agent/core`) were obsolete and created confusion in the chat slash palette.
- **Decision:**
  - **Deleted Prototype Skills:** Removed `skills/ay-kapanis`, `skills/sayim-fark`, and `skills/rapor-kalite` from `src/Sims/yula.client/skills`.
  - **Clean Built-in Skills Registry:** `built-in-skills.ts` and its test now register and verify exactly the 8 production Anthropic skills.
  - **Removed Example Skill Seeding:** `ensureExampleSkill` in `user-skills.ts` no longer seeds `gunluk-ozet`; it actively cleans up any existing `gunluk-ozet` entry from user `localStorage`.
  - **Localized Skills Namespace:** `LOCALIZABLE_SKILL_SLASHES` emptied in `yula-user-skill.ts`; removed orphaned commands (`attach`, `grid-top5`, `report-run-job`) and old skill entries from `tr.json` and `en.json`.
  - **Pure Core Templates:** Removed domain-specific mock templates from `prompt-templates.ts` in `@my-agent/core`; system commands (`/new`, `/model`, `/login`, `/compact`, `/plan`, `/help`) preserved.
- **Author:** Antigravity / Team

---

## [2026-09-20] Architectural Separation of User Screen Navigation vs In-IDE Interactions
- **Rationale:** When Yula is in Fullscreen Overlay mode (`expanded === true`), clicking any navigation element (in `ModuleSidebar`, `GlobalNavDrawer`, `AppHeader`, search results, or in-chat markdown links) signifies the user's explicit intent to view and interact with that application screen (`kullanıcı ekrana gitmek istiyor`). Previously:
  1. *Per-page Mount Trap:* `WorkspaceAiChatProvider` was mounted per-page inside `AppLayout`. Route transitions unmounted the old provider and mounted a new one, causing `prevPathnameRef` to initialize to the destination route on mount and fail route-change detection.
  2. *Same-Route / Link Clicks:* Clicking the active route in `ModuleSidebar` or other navigation elements did not trigger route changes, leaving the fullscreen overlay locked over the screen.
  3. *In-IDE Collision:* In `YulaIdeSidebar`, selecting past conversation sessions invoked `navigateToConversationScreen` with `router.push(href)`. This triggered route changes that closed the IDE overlay even though the user was simply switching chat sessions within the IDE.
- **Decision:**
  - **Root-Level Provider Mounting:** Moved `WorkspaceAiChatProvider` to `src/app/providers.tsx` at the root application shell. It now mounts once, never unmounts across route transitions, and permanently tracks route changes and clicks across `AppHeader`, `GlobalNavDrawer`, `ModuleSidebar`, and page contents.
  - **Universal Capture-Phase Navigation Interceptor:** Implemented `isScreenNavigationClick` and a capture-phase global click listener in `WorkspaceAiChatProvider`. Any click on internal screen links (`a[href]`) or screen navigation buttons (`[data-nav="screen"]`, `[data-slot="sidebar-menu-button"]`, `[data-slot="sidebar-menu-sub-button"]`) immediately collapses `expanded` to `false`. If the destination is home (`/`), it also closes the dock (`open = false`).
  - **In-IDE Action Separation:** Isolated all internal IDE operations (`[data-ide-action="true"]`, `[data-slot="ide-conversation-item"]`, `[data-slot="ide-folder-toggle"]`, `[data-slot="ide-control"]`, `[data-slot="chat-composer"]`). In `YulaIdeSidebar`, selecting past conversation sessions now calls `selectConversation(id)` and `restoreConversationExecution(...)` without invoking `router.push`, keeping the user immersed in the IDE without collapsing or flashing.
  - **Agent Programmatic Navigation:** Configured `useHeadlessSystemComponents` to explicitly set `expanded: false` and `open: true` when `app_router.NAVIGATE` is dispatched, ensuring report results are visible with the agent docked alongside.
- **Author:** Antigravity / Team

---

## [2026-09-20] Auto-Collapse Fullscreen Overlay on Navigation & Header Button Deduplication
- **Rationale:** Two usability issues were identified in Yula's fullscreen overlay mode:
  1. *Duplicate Actions:* The header previously displayed both an "Ekrana Odaklan" (`YulaFocusScreenButton`) on the left and a "Dock'a Küçül" (`YulaExpandToggleButton`) on the right. Both executed identical logic (`setExpanded(false)`), creating clutter and redundancy.
  2. *Overlay Trapping during Left Navigation:* When users clicked navigation links on the left (`ModuleSidebar`, `GlobalNavDrawer`), the underlying URL and page changed, but the fullscreen overlay remained stuck on top (`expanded === true`), completely hiding the destination ERP page. Additionally, `expanded` was persisted in `localStorage`, causing the overlay to re-appear on reloads/navigations.
- **Decision:**
  - **Deduplication:** Removed `YulaFocusScreenButton` from `yula-fullscreen-overlay.tsx` and `yula-dock-controls.tsx`. The standard window control `[⤢]` (`YulaExpandToggleButton`) on the right now serves as the single canonical collapse action.
  - **Navigation Awareness in Provider:** Updated `WorkspaceAiChatProvider` to monitor `pathname` transitions; whenever the route changes, `setExpanded(false)` is automatically triggered so that the target page is immediately revealed.
  - **Direct Sidebar Click Handling:** Added `setExpanded(false)` handler to `ModuleSidebar` links and buttons for instant responsive dismissal upon click.
  - **Non-Persistent Fullscreen State:** Updated `useYulaDockStore` persistence with `partialize: (s) => ({ open: s.open })`, ensuring `expanded` mode is never saved into `localStorage`.
- **Author:** Antigravity / Team

---

## [2026-09-20] Direct 3-Column Fullscreen Workspace for SystemHomeView (Root Path)
- **Rationale:** The system home view (`/`) is the primary landing screen of the Sims application. Having it render a single-column shell with an expand toggle to switch into fullscreen mode was redundant, as the home screen is already dedicated to the assistant workspace and has no underlying ERP view to collapse or minimize to.
- **Decision:**
  - `SystemHomeView` now directly renders `YulaFullscreenOverlay` in page flow (`isOverlay={false}`, `hideWindowControls={true}`).
  - Collapse (`YulaExpandToggleButton`) and close (`YulaCloseButton`) controls are omitted on the home view, since there is no background page to return to.
  - `YulaFullscreenHost` bypasses mounting on `pathname === "/"` to avoid duplicate overlay trees.
  - Workspace Search (Cmd+K / AppHeader) continues to render `WorkspaceSearchMainView` covering the home area when search is triggered.
  - In ERP pages, the side dock and fullscreen overlay behaviors remain intact with their full set of controls.
- **Author:** Antigravity / Team

---

## [2026-09-20] Harmonized Card Container & Header Height Chrome between Yula Full Mode and Dock Mode
- **Rationale:** The visual presentation of Yula in `full` mode (3-column IDE overlay) previously felt detached from the Sims workspace design language: columns lacked card boundaries, resize handles were thin border lines rather than standard 8px gutters, and the diagram canvas header had a 2-tier stacked bar (`h-16+`) rather than matching the uniform `h-11` (`panelHeaderClass`) height of dock mode and other workspace cards.
- **Decision:**
  - **Shared Chrome Standard:** Extended the design tokens defined in `panel-chrome.ts` to `YulaFullscreenOverlay`:
    - Root overlay container now applies `pageInsetGutterClass` (`p-2` / 8px outer gutter) so that the entire workspace cards float over the background canvas.
    - Wrapped all 3 columns (Sidebar, Chat, Canvas) inside `panelCardClass` (`rounded-md border bg-card shadow-none`).
    - Standardized resize handles to `panelResizeHandleClass` (`w-2 bg-transparent`), establishing consistent 8px transparent gaps between cards identical to the workspace query/report split layout.
    - Replaced the 2-tier canvas header with a single `h-11` row matching `panelHeaderClass` (`bg-card`, `border-b border-border px-3`), with diagram icon/title/type-badge on the left and action buttons (`Download SVG`, `Copy Code`, `Maximize`, `Close`) on the right.
    - Maximized canvas view now also adopts `panelCardClass` and `h-11` header within the same `p-2` outer gutter.
- **Author:** Antigravity / Team

---

## [2026-09-20] AppLayout Content-Frame Architecture for Yula Fullscreen Overlay Host
- **Rationale:** Previously, `YulaFullscreenOverlay` was mounted deep inside each individual page's `WorkspaceAiDock`. This caused layout clipping in screens with custom headers/banners (e.g. `ItemFormShell`), trapped the IDE overlay within leaf page containers, and risked duplicate chat instance mounts. The overlay must sit strictly at the application layout level (`AppLayout`), occupying the exact content canvas (`<main>`) bounded between the top `AppHeader` and the left `ModuleSidebar` (Sol Nav).
- **Decision:**
  - Created `yula-fullscreen-host.tsx` mounted inside `AppLayout`'s `<main>` frame, dynamically rendering `YulaFullscreenOverlay` with `absolute inset-0 z-40 rounded-t-2xl overflow-hidden` when `open && expanded` is active.
  - Extracted shared buttons (`YulaNewChatButton`, `YulaExpandToggleButton`, `YulaFocusScreenButton`, `YulaCloseButton`) into `yula-dock-controls.tsx`, shrinking `workspace-ai-dock.tsx` from 452 down to 312 lines (well below the 500-line ceiling).
  - Configured `WorkspaceSidePanelLayout` inside `WorkspaceAiDock` to use `open={open && !expanded}`, preventing duplicate chat panel instances when fullscreen overlay is active.
  - Retained `AppHeader` on top and `ModuleSidebar` on the left in full view and operation, allowing Yula IDE 3-column workspace to smoothly occupy 100% of the active main canvas.
  - Replaced decorative macOS window accent dots with a native Sims/Yula brand header bar aligned across all three IDE columns (`h-11 border-b border-border/40`).
  - Simplified the Dock Mode (side dock) header: stripped the bulky token usage badge and mode chip; streamlined the layout to just `[Agent Avatar / Mark] [Title]` on the left and `[+] [⤢] [✕]` on the right.
  - Formalized Yula's 3 distinct presentation modes: (1) `landingpage` mode (the default home screen format with centered hero greeting and spacious prompt), (2) `full` mode (the 3-column Antigravity IDE workspace with sidebar, chat stream, and diagram canvas), and (3) `dock` mode (the side dock for multi-tasking alongside ERP screens). Added mode switching between `landingpage` and `full` directly from the home screen header.
- **Author:** Antigravity / Team

## [2026-09-20] 3-Column Antigravity IDE Workspace for Yula Fullscreen Overlay Mode
- **Rationale:** In Yula Fullscreen mode, opening diagrams as a slide-out right drawer/sheet conflicted with the user's mental model and workspace productivity. As demonstrated in Antigravity IDE and modern developer tools, fullscreen workspaces naturally benefit from an authentic 3-column split view (Left: Conversations, History & Projects, Center: Chat Stream & Input, Right: IDE Canvas & Artifacts).
- **Decision:**
  - Built `yula-fullscreen-overlay.tsx` using Shadcn `<ResizablePanelGroup orientation="horizontal">` with 3 columns:
    1. *Column 1 (Left Sidebar):* Integrated `yula-ide-sidebar.tsx` with top `+ New Conversation` button, navigation quick links (Conversation History, Scheduled Tasks), Projects/Workspaces collapsible tree with relative time badges (`2m`, `4h`, `1d`, `2d`), and pinned bottom `Settings` button.
    2. *Column 2 (Center Chat):* Primary `AIChatPanel mode="main"` chat stream with IDE breadcrumb header (`Workspace > Session Title`), worked steps, and prompt composer.
    3. *Column 3 (Right Canvas):* Dynamic `yula-ide-canvas-header.tsx` with IDE tab bar, breadcrumbs (`Sims > yula.client > diagrams > Type > Title`), SVG export, code copy, and full-screen maximize toggle.
  - Refactored `workspace-ai-dock.tsx` to delegate fullscreen rendering to `yula-fullscreen-overlay.tsx`, reducing its size from 476 to 451 lines and preserving the strict 500-line limit.
- **Author:** Antigravity / Team

## [2026-09-20] Artifact & Side Canvas Architecture for Mermaid Diagrams (Dock & Fullscreen Split)
- **Rationale:** While lazy-rendered Mermaid diagrams worked well in general Markdown, wide diagrams (flowcharts, sequence diagrams, ERDs) rendered directly inside narrow chat bubbles in the AI side dock felt cramped and forced excessive horizontal scrolling. An adaptive "Artifact / Side Canvas" paradigm was required to deliver an expansive workspace experience.
- **Decision:**
  - **Dock Mode (Side Panel, ~32% width):** The chat renders a compact, interactive `MermaidChip` showing diagram type badge (`Flowchart`, `Sequence`, `ERD`, `State`, etc.), title, and line count. Clicking "Tuvalde Aç" (Open in Canvas) slides out a wide Shadcn `<Sheet side="right">` (`MermaidCanvasSheet`) with full-scale pan & zoom, code toggle, and SVG download. Users can also toggle an inline accordion preview directly in the message.
  - **Fullscreen Mode (Overlay):** Activating a diagram transitions the overlay into a split-view workspace using Shadcn `<ResizablePanelGroup orientation="horizontal">`. The left pane keeps chat history with a draggable split handle, while the right pane (`MermaidCanvasPanel`) renders the diagram in high fidelity with zoom controls, code copy, and SVG export.
  - **State Management:** Implemented `active-diagram-store.ts` via Zustand to coordinate active diagram payload (`id`, `chart`, `title`, `type`) and open/close state across dock, sheet, and split-panel layouts.
  - **Metadata Helper:** Extracted `detectDiagramMeta` into pure `mermaid-meta.ts` for regex-based metadata extraction without dependencies.
- **Author:** Antigravity / Team

## [2026-09-20] Dynamic Client-Side Mermaid Integration for Markdown (Chat & Docs)
- **Rationale:** Evaluated migrating markdown parsing to `next-mdx-remote`, `mdx-mermaid`, and `mermaid`. The MDX compiler approach was rejected due to critical flaws for conversational UI:
  1. *Streaming Choke:* Real-time token streaming (20-50 tokens/sec) causes browser freezing when running full MDX AST compilation on each chunk.
  2. *Security (RCE Risk):* MDX evaluates arbitrary JS/JSX expressions, creating Remote Code Execution and prompt-injection vulnerabilities in chat.
  3. *Heavy / Deprecated Dependencies:* `mdx-mermaid` requires Puppeteer (300MB headless browser) for SSR and is pinned to MDX v2.
- **Decision:**
  - Preserved the high-performance, token-streaming `react-markdown` + `marked.lexer` block memoization pipeline.
  - Installed only `mermaid` (v12) into `yula.client` and implemented a zero-overhead, lazy-loaded client component (`MermaidBlock`).
  - Integrated with Next.js themes (`useTheme()`) for automatic dark/light diagram styling.
  - Built streaming fault tolerance: during LLM token emission, incomplete syntax is gracefully handled without uncaught exceptions or screen flicker.
  - Added a dual-view segmented toggle (`[Diagram / Code]`) with one-click code copy and zoom controls in `MarkdownPreBlock` and `MarkdownDoc`.
- **Author:** Antigravity / Team

## [2026-09-20] Graph-Native (DAG) Architecture for Yula Playbook Wiki
- **Rationale:** While single-screen rules (`screen_rule`) operate well as simple markdown lists, multi-step workflow recipes (`workflow_recipe`) were prone to execution ambiguity and halucinations when stored as free-form prose. A Directed Acyclic Graph (DAG) model provides deterministic ReAct execution order, topological dependency checks, mathematical cycle detection, and live observability.
- **Decision:**
  - Implemented `PlaybookDAG` in `@my-agent/core` (`playbook-graph.ts`) as a zero-dependency, type-safe DAG container with Tarjan DFS cycle detection, Kahn's topological sort, and Markdown step parsing/serialization.
  - Enhanced `PlaybookService.lint()` to validate workflow recipe graph integrity during Karpathy procedural memory checks.
  - Installed `@xyflow/react` and `@dagrejs/dagre` in `yula.client` for interactive DAG visualization.
  - Created `WorkflowGraphCanvas.tsx` with dynamic in-browser Dagre auto-layout, avoiding hardcoded coordinate pollution in Git-tracked storage.
  - Upgraded `PlaybooksManagementView.tsx` with a dual-mode switcher (Card View vs. Graph Canvas) in the Workflows tab.
  - Preserved simple card/list layout for single-screen rules (`screen_rule`) to prevent overengineering.
- **Author:** Antigravity / Team

## [2026-09-20] Graph-Native (Node & Edge) Documentation Standard with Traversable Neighbor Links
- **Rationale:** Flat textual documentation failed to clearly capture the multi-agent control loops, event-driven reactive bridges, and Human-in-the-Loop (HITL) pause/resume flows in the Yula AI and Arrow ecosystem. Navigating dependencies, self-healing branches, and stagnation safeguards required a structured, traversable graph data model.
- **Decision:**
  - Established the mandatory **Graph-Native Documentation Standard** in `.agents/standards/graph-documentation-standard.md`.
  - Added Rule 5 to root `AGENTS.md` requiring all architecture and agent workflow documents to define: 1) Mermaid directed graph topology, 2) Nodes catalog (roles, schemas, contracts), 3) Edges & flow dynamics (inbound/outbound triggers, feedback loops, error fallbacks, and traversable neighbor markdown links).
  - Authored the canonical master system graph document in `src/yula-ai/agent.md`.
  - Refactored `.agents/architecture/headless-react-agent.md` to conform to the Node & Edge graph specification with reciprocal neighbor links.
- **Author:** Antigravity / Team

## [2026-09-20] Deterministic Local Development Ports & Instant Shutdown Protocol
- **Rationale:** Stopping local development services previously required exploratory port hunting via `lsof` and process tree queries across multiple turns. Local development runtimes (`yula.client` on 56402, `Sims.Server` on 5168/7137, `yula-ai` demo on 3000) have deterministic ports, allowing immediate, single-command process termination upon user request ("proje kapat").
- **Decision:**
  - Standardized all default ports and commands in `.agents/standards/dev-operations.md`.
  - Defined the instant shutdown one-liner: `kill -9 $(lsof -ti:56402,3000,5168,7137) 2>/dev/null; pkill -f "dotnet run|next-server|yula.client.*next" 2>/dev/null || true`.
  - Recorded user preference in global memories (`~/.gemini/GEMINI.md`) and linked in `.agents/index.md` and root `AGENTS.md`.
- **Author:** Antigravity / Team

## [2026-09-20] Documented Core UI Components (VirtualSpreadsheet, Criteria Form, Yula Client/AI)
- **Rationale:** The application's core presentation layer relies on specialized, high-performance UI systems: an Airtable/Excel-style virtual grid, a schema-generated criteria engine, and the Yula Client/AI runtime. Developers and AI agents required a unified architecture guide detailing these components and their performance invariants.
- **Decision:**
  - Created `.agents/architecture/core-ui-components.md` detailing VirtualSpreadsheet (Canvas 2D zero-reflow sizing, bi-directional virtualization, Airtable aggregations, Excel selection), Schema-Generated Criteria Forms (JSON Schema contracts, D365/BC syntax, Zod preflight), and the Yula Client/AI platform ecosystem.
  - Linked the document in `.agents/index.md` and root `AGENTS.md`.
- **Author:** Antigravity / Team

## [2026-09-20] Documented Arrow Jobs .NET Engine & Frontend Pipeline

- **Rationale:** The asynchronous job execution pipeline spans both .NET backend (`Arrow.Jobs.*`) and Next.js frontend (`yula.client`). Its distributed queue, worker model, SSE event bus, and OPFS/DuckDB handoff required explicit, centralized architectural documentation.
- **Decision:**
  - Created `.agents/architecture/arrow-jobs-engine.md` documenting solution topology (`Abstractions`, `AspNetCore`, `InMemory`, `Postgres`, `Redis`), lifecycle states, Minimal API contracts, and frontend integration.
  - Linked the document in `.agents/index.md` and root `AGENTS.md`.
- **Author:** Antigravity / Team

## [2026-09-20] Tauri Desktop and Python Sidecar Marked as TO-BE (Inactive)

- **Rationale:** The immediate product focus is on the web-first Next.js ERP application, DuckDB WASM analytics, and single-page SSE reports. Desktop packaging and Python process execution are not in active scope.
- **Decision:**
  - Marked `.agents/knowledge/tauri-hybrid.md` and `.agents/knowledge/python-sidecar.md` with explicit `[TO-BE]` warnings instructing coding agents not to prioritize or implement them unless explicitly requested.
  - Tagged both topics as `TO-BE (Future / Inactive)` in `.agents/index.md` and root `AGENTS.md`.
- **Author:** Antigravity / Team

## [2026-09-20] Enforced English-Only Documentation & Evolutive Wiki Protocol

- **Rationale:** LLM tokenizers and instruction-following attention mechanisms perform with significantly higher accuracy and ~35% lower token consumption when operating on English technical guidelines. Furthermore, documentation must evolve dynamically with user corrections without manual prompts.
- **Decision:**
  - Added 4th Golden Rule to root `AGENTS.md` enforcing English-only repository documentation.
  - Formalized the Evolutive Wiki Maintenance Protocol: AI agents must update the relevant `.agents/*.md` document in English and record an append-only entry in `.agents/log.md` whenever an architectural convention or rule is created or corrected.
  - User-agent conversations remain in the user's preferred language (Turkish).
- **Author:** Antigravity / Team

## [2026-09-20] Separation of Library (@my-agent) and Application (yula.client) AGENTS.md

- **Rationale:** `@my-agent` is a domain-agnostic headless UI-Agent framework, whereas `yula.client` contains ERP/Sims business rules and reports. Storing their operational guidelines in a single place caused context pollution and compromised library portability.
- **Decision:**
  - Standardized `src/yula-ai/AGENTS.md` as the library operational guide with strict domain-agnostic rules.
  - Updated root `AGENTS.md` and `.agents/index.md` with explicit Layer and Submodule Router maps.
- **Author:** Antigravity / Team

## [2026-09-20] Transition to Developer Agent Wiki (.agents/) Architecture
- **Rationale:** Monolithic `AGENTS.md` files reached ~44,000 bytes (~10,000 tokens), causing high per-turn latency, token bloat, and context dilution.
- **Decision:** Implemented Karpathy's "LLM Wiki" pattern under `.agents/` (`index.md`, `log.md`, `architecture/`, `standards/`, `knowledge/`). Slimmed down root `AGENTS.md` to a lightweight ~35-line Master Router.
- **Author:** Antigravity / Team

## [2026-09-20] Procedural Memory & Playbook (Karpathy LLM Wiki Pattern)
- **Rationale:** The AI agent had amnesia regarding screen-specific operational procedures and repeated exploratory trial-and-error queries from scratch on every turn.
- **Decision:**
  - Implemented `PlaybookService`, `MemoryPlaybookStorage`, `RestPlaybookStorage`, and `LocalStoragePlaybookStorage` in `@my-agent/core`.
  - Added `AgentProvider` DI support and `useAgentPlaybook` hook in `@my-agent/react`.
  - Added Markdown-backed server storage (`ServerFsPlaybookStorage`) in `yula.client` under `storage/wiki/workspaces/<workspace>/`.
  - Surfaced active Wiki reading tier (`Workspace Wiki`, `User Wiki`, `System Baseline`) and playbook updates (`propose_playbook_update`) transparently in the Worked Steps UI.
- **Author:** Antigravity / Team

## [2026-09-20] ReAct / Plan Mode Badge, Focus Screen Button, and Event Bus Dedup
- **Rationale:** Triggering confirmation cards when the user is already on the target screen slowed down execution; fullscreen overlay also needed an instant way to focus on the underlying page.
- **Decision:**
  - Screen scope (`/stock/stock-balance`) defaults to **Direct ReAct** mode; global scope (`/`, `/dashboard`) defaults to **Plan-First** mode.
  - Added live status badge (`YulaAgentModeChip`: `ReAct`, `Plan`, `Reasoning…`, `Acting…`) to the side dock and fullscreen header.
  - Added `YulaFocusScreenButton` in fullscreen overlay to collapse the dock and focus on the underlying screen with `USER_FOCUS_SCREEN` telemetry.
  - Added 150ms windowed deduplication and coalescing in `uiEventBus`.
- **Author:** Antigravity / Team

## [2026-09-18] Single-Page Unified Report Flow & SSE Anti-Buffering
- **Rationale:** Separate `[jobId]` pages polluted browser history and triggered full reload overhead on navigation.
- **Decision:**
  - Unified report flow under `src/app/<workspace>/<report>/page.tsx?jobId=<guid>`.
  - Configured backend SSE (`ArrowJobSse.cs`) with anti-buffering headers (`X-Accel-Buffering: no`, `Cache-Control: no-transform`) and immediate response body flushing.
  - Built `ArrowJobEventHub` singleton event dispatcher with visual micro-rhythm (~70ms tempo) on the frontend.
- **Author:** Antigravity / Team

## [2026-09-10] Headless React UI-Agent (@my-agent) & Tool Consolidation
- **Rationale:** 20+ fragmented manual tool calls overwhelmed the LLM and caused high token waste and reasoning failures.
- **Decision:**
  - Replaced manual tool loops with `@my-agent/core` and `@my-agent/react` featuring 6 standard tools (`STANDARD_AGENT_TOOLS`).
  - Wrapped interactive components natively via `useAgentComponent` in their own React lifecycle.
  - Strictly banned popup modals; implemented inline interactive choice cards (`YulaChoiceCard` via `ask_user_choice`).
- **Author:** Antigravity / Team

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

## [2026-09-20] Integration of Anthropic Agent Skills (xlsx, pdf, mcp-builder, frontend-design, skill-creator)
- **Rationale:** Equipping the Yula Agent and developers with production-tested domain guidelines for Excel modeling, PDF document extraction, Model Context Protocol server development, distinctive UI design, and meta-skill authoring.
- **Decision:**
  - Added 5 new built-in skills under `src/Sims/yula.client/skills/`: `xlsx`, `pdf`, `mcp-builder`, `frontend-design`, `skill-creator`.
  - Registered all 5 skills into `built-in-skills.ts` and updated `built-in-skills.test.ts`.
  - Linked `xlsx` directly with the Pyodide Web Worker runtime (`openpyxl` & `pandas`).
  - Verified 100% test passing across the test suite (212/212 tests pass).
- **Author:** Antigravity / Team

## [2026-09-20] Integration of Document & Presentation Skills (doc-coauthoring, docx, pptx)
- **Rationale:** Providing the Yula Agent with production guidelines for collaborative technical document authoring (PRDs, specs, ADRs), programmatic Word (.docx) document generation via docx-js, and executive PowerPoint (.pptx) slide deck creation.
- **Decision:**
  - Added 3 built-in skills under `src/Sims/yula.client/skills/`: `doc-coauthoring`, `docx`, and `pptx`.
  - Registered all skills into `built-in-skills.ts` and updated `built-in-skills.test.ts` (11 total built-in skills).
  - Validated test suite passing (212/212 pass) and clean lint/types.
- **Author:** Antigravity / Team
