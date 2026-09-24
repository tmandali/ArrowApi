# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

## [2026-09-24] URN Provider Architecture with Authority & Issuer Isolation
- **Rationale:** Previously, all Keycloak instances (local Docker on `localhost:8080` vs. corporate test on `keycloaktest.lcwaikiki.com`) reported generic `provider = "keycloak"`. This prevented the system from distinguishing identities created in a developer's local Docker Keycloak from authorized corporate identities, potentially allowing privilege cross-contamination if a developer switched environments.
- **Decision:**
  - Implemented the **URN Format (Method A)**: `provider:authority` (e.g. `keycloak:keycloaktest.lcwaikiki.com` vs. `keycloak:localhost:8080`, `google`, `ldap:corp.lcwaikiki.local`).
  - Enhanced `normalizeProvider` in [`session-identity.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/features/auth/lib/session-identity.ts) to parse and stamp the active `KEYCLOAK_ISSUER` host domain onto the provider key.
  - Enhanced `refreshEndpoint` in [`auth-helpers.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/features/auth/lib/auth-helpers.ts) to recognize URN prefixes (`keycloak:*` and `google:*`).
  - Updated `auth.ts` JWT callback to stamp URN provider into session token.
  - Migrated existing catalog and identity records in PostgreSQL from `keycloak` to `keycloak:keycloaktest.lcwaikiki.com`.
- **Verification:** Verified Docker Keycloak and Corporate Keycloak resolve to distinct, mutually isolated provider URNs. `tsc --noEmit` and `oxlint` 0 errors.
- **Author:** Antigravity / Team

---

## [2026-09-24] Same-Provider Auto-Linking with Cross-Provider Zero-Trust Isolation
- **Rationale:** Keycloak test realms (such as `keycloaktest.lcwaikiki.com`) frequently issue transient/ephemeral subject identifiers (`sub`) upon session renewal or user re-synchronization. While cross-provider isolation must prevent unverified IdPs from escalating privileges by claiming a corporate email, logins originating from the *same* verified Identity Provider (e.g. `provider === 'keycloak'`) should automatically link to the existing `app_users` catalog record.
- **Decision:**
  - In `upsertIdentityFromSession` ([`app-user-sync.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/features/auth/lib/app-user-sync.ts)), when inserting a new identity row, check if `app_users` already has a non-deleted user with matching `provider` AND `email`.
  - If both `provider` and `email` match, set `userId = existingSameProviderUser.id` automatically. This permanently prevents authorized users from reverting to Guest upon dynamic `sub` reissuance.
  - If `provider` differs (e.g. Google OAuth or another external IdP), `userId` remains `null` (Guest), maintaining strict Zero-Trust isolation.
- **Verification:** Verified with 4 historical Keycloak `sub` GUIDs for `timur.mandali@lcwaikiki.com`. `tsc --noEmit` and `oxlint` 0 errors.
- **Author:** Antigravity / Team

---

## [2026-09-24] Multi-Tenant Scoped RBAC (Tenant-Aware Role Management)
- **Rationale:** In enterprise multi-company/holding architectures, a user may be an `Admin` in Tenant A (e.g. LC Waikiki) while acting as a `Guest` or `Viewer` in Tenant B (e.g. Dipen). Platform-level global roles (`app_users.role`) alone could not express company-scoped privileges without granting excessive rights across unrelated tenants.
- **Decision:**
  - **Database Schema:** Created `user_tenant_roles` table (`userId`, `tenantId`, `role`, `updatedAt`, `createdAt`) with unique index on `(userId, tenantId)`. Migration `0006_stiff_butterfly.sql` generated and applied to PostgreSQL.
  - **Account Status Bridge:** Enhanced `GET /api/auth/account-status` to query and return `tenantRoles: Record<string, string>` alongside catalog status and global role.
  - **Client Role Store:** Extended `auth-role-store` to maintain `tenantRoles: Record<string, string>`.
  - **Dynamic Effective Role Hook:** Updated `useEffectiveRole()` to read `activeCompanyId` from `useCompanyStore` and dynamically calculate `role` ("Admin", "Member", "Viewer", "Guest") and `isTenantAdmin` for the active company, while preserving global `isSystemAdmin` for platform administration.
  - **System Users UI:** Created `SystemUserTenantRolesCell` component allowing system administrators to inspect and modify tenant-specific roles per company (`COMPANY_CATALOG`) directly in `/system/users`.
- **Verification:**
  - `user_tenant_roles` seeded for `usr_bf4db720-6802-4273-8839-425df3011778` (`timur.mandali@lcwaikiki.com`) with `lcw` ➔ `Admin`, `dipen` ➔ `Guest`, and `sun-inc` ➔ `Viewer`.
  - Full TypeScript compilation (`tsc --noEmit`) clean (0 errors).
  - Code linting (`oxlint`) clean (0 errors).
  - Test suite (491 tests across 117 suites) passed 100%.
  - All files strictly verified under 500 lines (`SystemUsersView.tsx` at 458 lines).
- **Author:** Antigravity / Team

---

## [2026-09-24] Auto-Linking of Dynamic IdP Sub Identities to Authorized Catalog Users
- **Rationale:** Keycloak test realms and enterprise IdPs can issue dynamic/ephemeral subject identifiers (`sub`) across sessions or upon container restarts. Previously, new `sub` logins unconditionally created `user_identities` rows with `userId: null`, degrading authorized administrators to Guest status until manual database intervention.
- **Decision:**
  - In `upsertIdentityFromSession` ([`app-user-sync.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/features/auth/lib/app-user-sync.ts)), when inserting a new identity row, check if the session email already matches an authorized record in `app_users`.
  - If a match is found, auto-link `user_identities.userId` directly to the existing `app_users.id`, preventing authorization loss while preserving strict isolation for uncataloged guests.
  - Configured corporate proxy (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`) in `launchSettings.json` and `--use-env-proxy` in `package.json`.
- **Verification:** Tested with multiple Keycloak `sub` IDs; all resolved to `System Administrator`. `tsc --noEmit` and `oxlint` clean (0 errors).
- **Author:** Antigravity / Team

---

## [2026-09-24] Fix: Circular Structure Serialization Guard for Bounded Contexts
- **Rationale:** Next.js 16 (Turbopack) and `@my-agent/react` runtime serializes agent component metadata using `JSON.stringify(meta)`. The bidirectional link between `BoundedContextContract.screen` and `ScreenContract.boundedContext` triggered a fatal `TypeError: Converting circular structure to JSON` during page hydration in `useScreenBinding`.
- **Decision:**
  - Attached `contract.screen.boundedContext` as a **non-enumerable property** (`Object.defineProperty(contract.screen, "boundedContext", { value: contract, enumerable: false, configurable: true, writable: true })`) in `defineBoundedContext` ([`bounded-context.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/lib/contracts/bounded-context.ts)) and preserved the non-enumerable descriptor during `resolveContextStrategy` ([`jurisdiction-strategy.ts`](file:///c:/Users/TIMUR.MANDALI/source/git.tmandali/ArrowApi/src/Sims/yula.client/src/lib/contracts/jurisdiction-strategy.ts)). This allows natural runtime property traversal (`screen.boundedContext...`) while ensuring `JSON.stringify()` completely ignores the edge.
  - In `use-screen-binding.ts`, introduced `sanitizedBoundedContext` via `useMemo` that strips `.screen` prior to passing `meta.boundedContext` to `useAgentComponent` as defense-in-depth.
  - Cleaned all manual enumerable `(context.screen as any).boundedContext = context;` assignments across 11 workspace context files.
- **Verification:** Added circular JSON serialization unit test to `bounded-context.test.ts`. 99/99 unit tests passing. Full `tsc --noEmit` clean (0 errors).
- **Author:** Antigravity / Team

---

## [2026-09-24] Full Codebase Alignment: 9-Layer Domain Architecture & Contract-Driven UI Projection
- **Rationale:** To eliminate fragile conditional checks (e.g. `if (country === 'TR')` or `if (status === 'Draft')`) across frontend components and complete the enterprise value stream, we aligned all workspace menus and screens in `selling`, `stock`, and `accounting` with the 9-layer Domain-Driven Architecture (1 Menu Item = 1 Bounded Context, Aggregate Root & Invariants, Multi-Jurisdiction Strategy, Tenant-Segregated Batch, and Multi-Orchestrator Saga Engine).
- **Decision:**
  - **Phase 1: Transactional Backbone (`selling` & `stock`):**
    - `selling/sales-order`: Full Bounded Context connecting `SalesOrderAggregate` (Root + Items + Invariants), `salesOrderProcess` (`Draft ➔ PendingApproval ➔ Approved ➔ Dispatched ➔ Completed/Canceled`), and TR (E-Fatura Senaryo) & DE (USt-IdNr/§13b) strategies.
    - `stock/delivery-note`: Formalized `DeliveryNoteAggregate` with `minCount: 1` and `total_qty === sum(items.qty)` invariants, `deliveryNoteProcess`, TR GİB E-İrsaliye strategy (UUID, carrier VKN, driver TCKN, plate number), and DE Lieferschein strategy (Frachtbrief CMR, Spedition).
    - `selling/sales-invoice`: Formalized `SalesInvoiceAggregate` with `items`, `tax_breakdown`, and 3 mathematical invariants (`grand_total === subtotal + tax_total`), `salesInvoiceProcess`, TR GİB E-Fatura/Tevkifat strategy, and DE XRechnung/GoBD strategy.
  - **Phase 2: Stock Workspace Reports & Stock Orchestrator:**
    - Formalized CQRS Analytical Read Models: `stock-ledger` (item, warehouse, date, batch), `stock-analytics` (trend per periods, turnover), and `retail-sales-report` (POS profile, cashier).
    - Created `stock.orchestrator.ts` managing `stock:inter-warehouse-transfer` (with TR GİB e-İrsaliye & DE GoBD protocol injection) and `stock:inventory-reconciliation` (with physical count audit and 50,000 TL HITL suspension threshold).
  - **Phase 3: Accounting Workspace Ledgers & Accounting Orchestrator:**
    - Formalized Analytical Contexts: `general-ledger` (account, cost center), `customer-ledger` (party: customer), and `supplier-ledger` (party: supplier).
    - Created `accounting.orchestrator.ts` managing `accounting:period-closing` (verifying unposted entries, asserting debit === credit trial balance equality, period lock with fiscal-year CFO HITL signoff).
  - **Phase 4: Contract-Driven UI Projection (Zero-IF Architecture):**
    - Built headless hook `useEffectiveBoundedContext(baseContext, { countryCode })`.
    - Built `<BoundedContextActionToolbar />` deriving available transition buttons dynamically from `effectiveProcess.transitions.filter(t => t.from === currentStatus)`.
    - Built `<BoundedContextFormShell />` projecting header fields from `effectiveContext.state.fields` (including country-augmented fields) with zero conditional if checks in view code, and displaying Aggregate Invariant violation alerts.
- **Verification:**
  - 98/98 unit tests passed across 12 test suites (100% pass rate in `transactional-backbone.test.ts`, `stock-workspace-alignment.test.ts`, `accounting-workspace-alignment.test.ts`, `workflow-orchestrator.test.ts`, `bounded-context.test.ts`).
  - `tsc --noEmit` verified 0 TypeScript compiler errors.
  - `node scripts/i18n-check-wrapper.js` verified 0 missing or undefined localization keys.
  - All 43 newly created and modified files strictly respect `wc -l <= 500`.
- **Author:** Antigravity / Team

---

## [2026-09-24] Multi-Orchestrator & Saga Workflow Architecture (Cross-Context Process Manager)
- **Rationale:** While Bounded Processes (`*.process.ts`) govern state machines strictly within a single Bounded Context, enterprise value streams (e.g. Order-to-Cash, Procure-to-Pay) span multiple Bounded Contexts. To prevent monolithic "God Orchestrators" and maintain modularity, we established a Multi-Orchestrator and Distributed Saga Architecture operating at Workspace and Cross-Workspace levels.
- **Decision:**
  - **Saga Orchestrator Engine (`workflow-orchestrator.ts`):** Defined typed contracts for `SagaStep`, `SagaDefinition`, `SagaExecutionContext`, with forward payload transformation, reverse compensating rollback (`compensate`), and inline Human-in-the-Loop (`hitlCheck`) suspension/resumption.
  - **Saga Strategy Pattern (`saga-strategy.ts`):** Implemented $\mathbf{Effective\ Saga = Base\ Saga \oplus Country\ Strategy(countryCode,\ channel)}$ enabling dynamic step injection (`additionalSteps` with `insertAfter`/`insertBefore`) and 3-tier state accumulation without pipeline duplication.
  - **Multi-Orchestrator Registry (`saga-registry.ts`):** Built central discovery registry segregating workspace-level sagas from global/cross-workspace value streams with LLM markdown prompt generation (`formatSagaPrompt`, `formatAllSagasPrompt`).
  - **Selling Workspace Pilot (`selling.orchestrator.ts`):** Implemented `selling:domestic-order-to-invoice` with TR strategy (injecting GİB E-İrsaliye) and DE strategy (injecting VIES VAT validation and GoBD), plus `selling:export-order`.
  - **Cross-Workspace Pilot (`order-to-cash.orchestrator.ts`):** Implemented enterprise value stream coordinating `selling` (Order), `stock` (Dispatch), and `accounting` (General Ledger & AR).
  - **Standard Formalization:** Authored `.agents/standards/workspace-orchestration-saga-standard.md` (Sections 1-8) and linked in `.agents/index.md` and `AGENTS.md`.
- **Verification:** Unit tests passed for `workflow-orchestrator.test.ts` (Happy Path, Compensation Rollback, HITL Suspension/Resume, Registry Isolation, TR GİB Injection, DE VIES Injection). All 18 tests green across 5 suites. `tsc --noEmit` passed with 0 errors. All files strictly $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-24] Bounded Context & Menu Architecture Standard (1 Menu Item = 1 Bounded Context)
- **Rationale:** While `useScreenBinding` informed the LLM of DOM topology and actions, the agent lacked domain/master data semantics, lifecycle state machines, and multi-jurisdiction compliance. Establishing a 1:1 mapping between menu items and Bounded Contexts ($BC = Bounded Process + Bounded State$) structures enterprise knowledge cleanly without disrupting Next.js `src/app/` routing or `src/features/` platform engines.
- **Decision:**
  - **Bounded Context Contract (`bounded-context.ts`):** Defined typed contracts for `BoundedStateDefinition` (fields, aliases, enums, rules) and `BoundedProcessDefinition` (statuses, transitions, guards), plus `formatBoundedContextPrompt()` formatting for LLM grounding.
  - **Multi-Jurisdiction Strategy Pattern (`jurisdiction-strategy.ts`):** Implemented $\mathbf{Effective\ Context = Base\ Context \oplus Country\ Strategy(countryCode)}$ resolved dynamically at session level (`useScreenBinding`) with zero separate country-specific menu items. Pilot: TR (GTİP, Tevkifat, ÖTV) vs DE (Zolltarifnummer, MwSt, GoBD).
  - **Cross-Company Segregated Batch Operations (`cross-company-batch.ts`):** Built `executeSegregatedBatch()` and `formatSegregatedBatchReport()` allowing multi-tenant holding users (e.g. 1 user managing 5 companies) to execute cross-company actions with strict tenant isolation, isolated jurisdiction rules, and partitioned result summaries.
  - **Full i18n Parity (`messages/{tr,en}.json`):** Full synchronization of `BoundedContext` translation namespaces with runtime dynamic prompt serialization in the user's active language.
  - **Dot-Suffix Standard:** Standardized on `[name].context.ts`, `[name].state.ts`, `[name].process.ts`, and `strategies/[name].[country].ts`.
  - **Aggregate Root & Invariants (`aggregate-root.ts`):** Formalized DDD Aggregates for transactional documents with Header (Root Entity), Lines/Details (Child Collections with `minCount`/`maxCount`), and transactional consistency Invariants (`validateAggregateInvariants`). Pilot: `sales-order.state.ts`.
  - **Stock Workspace Pilot:** Implemented `item.state.ts` + `item.context.ts` (Master Data + Strategies) and `stock-balance.state.ts` + `stock-balance.context.ts` (Analytical Context).
- **Verification:** Unit tests passed for `aggregate-root.test.ts`, `bounded-context.test.ts`, `jurisdiction-strategy.test.ts`, `cross-company-batch.test.ts`, and `screen-binding-journey.test.ts`. Full `tsc --noEmit` clean. All files $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-24] Streamdown Streaming Markdown Architecture Integration
- **Rationale:** Assistant streaming responses occasionally produced empty or broken code fence boxes due to a hybrid pipeline splitting markdown lists line-by-line (`marked.lexer` + `split('\n')`). Since the project standardizes on Vercel AI SDK (`ai: ^7.0.83`), transitioning the chat markdown engine to Vercel's official `streamdown` (`vercel/streamdown`) eliminates hybrid parsing and natively repairs unterminated tokens during active model streaming.
- **Decision:**
  - **Adopted `streamdown` (`streamdown: 2.6.0`):** Integrated Vercel's streaming-optimized markdown renderer featuring built-in `remend` token recovery (virtual completion of unclosed code fences, tables, and links during streaming).
  - **Unified Component Mapping (`markdownComponents`):** Reused and mapped existing styled components (`p`, `li`, `table`, `code`, `MarkdownPreBlock`, `MermaidChip`) to Streamdown's `components` prop.
  - **Pruned Redundant Markdown Stack:** Migrated `skill-markdown-doc.tsx` to `Streamdown`, removed `react-markdown` and `remark-gfm` from `package.json`, and deleted orphaned `mermaid-canvas-panel.tsx` (superseded by `mermaid-canvas-sheet.tsx`). Verified with `knip` (zero dead code, zero unused dependencies).
  - **Substantive Content Preservation in Chat Turns:** Resolved an issue where multi-step assistant turns prematurely classified rich explanatory markdown tables or headings as transient `plan_rationale` when tools were invoked, mistakenly swallowing them into the collapsible Worked Steps accordion. `use-chat-turns.ts` and `yula-worked-steps.tsx` now distinguish rich substantive content (tables, headings, comprehensive text) so it remains in the primary assistant bubble as `final_synthesis`.
  - **Streamdown in Worked Step Details:** Updated `yula-worked-phase-card.tsx` to render `step.detailText` via `Streamdown` instead of raw `whitespace-pre-wrap` text, guaranteeing rich formatting for any intermediate thought steps.
  - **AST Preservation for Code Blocks in Lists:** Retained `hasEmbeddedCode` guard and full-block preservation so fences are never torn across lines.
  - **Tailwind v4 Integration:** Added `@source "../../node_modules/streamdown/dist/*.js"` in `globals.css` for full utility class compilation.
  - **Node Test Runner CJS Shim (`scripts/streamdown-shim.cjs`):** Configured `register-md.cjs` with a lightweight mock shim for headless unit test execution under `tsx`/CommonJS.
  - **Resolved Lucide Icon Shadowing in `workflow-graph-canvas.tsx`:** Renamed `Map` import to `MapIcon` to avoid shadowing JavaScript's global `Map` constructor.
- **Verification:** All 492 unit tests and 8 suite virtual spreadsheet grid tests passed green (100% pass rate). `knip` reported 0 unused dependencies/exports. `oxlint` reported 0 errors and 0 warnings across 900 files. `tsc --noEmit` clean with 0 errors.
- **Author:** Antigravity / Team

## [2026-09-24] Canvas Navigation Standard: Zoom-at-Cursor, Fit-to-View, Minimap & Code/View Toggle
- **Rationale:** Users requested intuitive Figma/Miro-like canvas navigation and direct code inspection across all diagram viewers (`WorkflowGraphCanvas` DAG viewer and `MermaidBlock`/`MermaidCanvasSheet`). In accordance with graphical UI standards, wheel scroll performs zoom directly towards the cursor coordinate, Space + drag acts as the Hand tool (Pan), middle-click provides quick pan, diagrams offer an interactive radar MiniMap with a Fit-to-View action, and users can copy diagram code or toggle between visual rendering and raw source code.
- **Decision:**
  - **Zoom towards Cursor (Feature 1):** In `MermaidBlock.tsx`, implemented exact focal point zoom mathematics ($newPan = P - (P - pan) \times \frac{nextZoom}{prevZoom}$) ensuring the exact point under the mouse cursor remains static while zooming.
  - **Fit to View & Shortcuts (Feature 2):** In `WorkflowGraphCanvas.tsx`, wrapped with `ReactFlowProvider` and integrated `useReactFlow().fitView` with an explicit toolbar button and keyboard shortcut (`F` / Double-click). In `MermaidBlock.tsx`, implemented container-aware SVG viewBox scaling with centered pan on render, `F` key, and Double-click.
  - **Interactive MiniMap Navigation (Feature 3):** Created `MermaidMinimap.tsx` featuring a scaled preview and a draggable/clickable viewport indicator rectangle synchronizing 2D pan coordinates. Integrated `MiniMap` toggle (`MapIcon` / `M` key) in both React Flow and Mermaid viewers.
  - **Copy Code & View / Code Toggle:** Implemented toolbar actions for one-click code copy (using `copyToClipboard` with checkmark visual feedback) and toggle button between interactive visual diagram (`Eye` icon) and formatted monospaced source code (`Code` icon) across both Mermaid and DAG workflow viewers.
  - **Wheel Zoom Event Listener Lifecycle & Synchronous Ref Fix:** Resolved an issue where mouse wheel zoom did not fire because the `wheel` event listener effect was using an empty dependency array (`[]`) on mount, when the container DOM element was still `null` due to initial `"loading"` state. Fixed by keying the effect on `[cleanSvg, showCode, status]`, attaching native non-passive wheel listeners as soon as the canvas container is committed, and maintaining `zoomRef` and `panRef` to handle high-frequency wheel ticks synchronously without stale-state jitter or inter-state updater violations.
- **Verification:** `npx oxlint` passed with 0 errors/warnings on all modified files. `npx tsx --test src/components/layout/chat-markdown/mermaid.test.ts` passed 6/6 tests. Full `tsc --noEmit` clean. All files strictly $\le 500$ lines (`workflow-graph-canvas.tsx`: 490, `mermaid-block.tsx`: 494, `mermaid-minimap.tsx`: 152, `mermaid-canvas-sheet.tsx`: 157, `mermaid-utils.ts`: 39).
- **Author:** Antigravity / Team

---

## [2026-09-24] Unified HITL Decision Composer Dock & Retired Inline Choice Cards
- **Rationale:** Previously, user approvals and choices (`ask_user_choice`, `request_user_confirmation`) rendered bulky interactive button clusters inside chat bubbles (`YulaChoiceCard`). After users made selections or the conversation progressed, these inline buttons remained in the scrollback history, causing visual clutter, accidental duplicate clicks, and stale interaction states. Furthermore, they lacked keyboard navigation ergonomics (such as numbered 1-9 shortcuts and Enter-to-submit).
- **Decision:**
  - **Single Interactive Decision Dock (`HitlDecisionComposer`):** Morph the bottom `ChatComposer` into an interactive decision card matching terminal approval modal standards whenever an assistant turn requests input (`isSuspended && pendingChoice`).
  - **Keyboard Ergonomics:** Numbered option badges `1`-`9` selectable with number keys, `Enter` to submit choice or custom input, `Esc` or `Skip` button to pass. Monospaced code/command box for command confirmation (e.g. CLI commands, SQL queries).
  - **Contract Normalization (`hitl-prompt.ts`):** Created `normalizeHitlPrompt()` to map both `ask_user_choice` and `request_user_confirmation` to standard `HitlPromptData`.
  - **Clean Retrospective Chat History:** Simplified `YulaChoiceCard` into an immutable resolution badge (`✓ [Question] ➔ [Selected Option]`) in chat history, eliminating duplicate interactive controls.
  - **Worked Steps State:** Active steps now show `PauseCircle` with `text-amber-500 animate-pulse` and subLabel `"Waiting for user input..."`.
- **Verification:** Added `hitl-prompt.test.ts`. All 495 tests pass across 118 suites. `pnpm typecheck` passed (0 errors), `pnpm lint` (oxlint) passed (0 errors across 904 files), `pnpm check:deps` (knip) passed (0 issues), `pnpm test:grid` passed. All files strictly adhere to $\le 500$ lines.
- **Author:** Antigravity / Team

---

## [2026-09-24] Enforcement of Dynamic Schema Grounding & `ask_user_choice` HITL Protocol
- **Rationale:** When users issued requests missing mandatory report criteria (e.g. `"geçen hafta satışlarını getir"` missing company code), the assistant previously formulated open-ended natural language questions (e.g. `"Hangi şirket koduyla devam edelim?"`) as a direct answer without invoking the `ask_user_choice` tool. This occurred because:
  1. The LLM lacked target report criteria options (`REPORTS_DIGEST_LINES`) in global orchestration mode, starving it of the concrete schema enum values needed to construct valid options without hallucinating.
  2. The prompt phrased tool usage as optional `(or offer structured options via 'ask_user_choice')`.
  3. Static prompt examples like `(e.g. TJ01, TJ02, TRLC)` were strictly avoided as misleading anti-patterns that bias the model with hardcoded mocks.
- **Decision:**
  - **Dynamic Report Digest Grounding:** Injected `REPORTS_DIGEST_LINES` directly into `GLOBAL ORCHESTRATION & PLAN-FIRST MODE` in `yula-agent-prompt.ts`, equipping the model with the exact report catalog, required criteria fields, and actual schema enum options (e.g. `sirketKod (options: TJ01|TJ02|TRLC)`).
  - **Zero Domain Leakage into Orchestrator:** Strictly removed any hardcoded mock company codes from general orchestration directives.
  - **Mandatory HITL Steering Directive:** Mandated that when missing criteria have discrete options in the schema or catalog, the model MUST call `ask_user_choice` to suspend the turn and present the interactive `HitlDecisionComposer`.
- **Verification:** `yula-agent-prompt.test.ts` (26/26 tests passed), `pnpm typecheck` (0 errors), `pnpm lint` (0 errors across 904 files). File length 433 lines ($\le 500$).
- **Author:** Antigravity / Team

---

## 📜 Prior Decisions Archive
Older architectural decisions have been archived to adhere to the 500-line limit:
- [Decision Log Archive 4 (.agents/log-archive-4.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-4.md)
- [Decision Log Archive 3 (.agents/log-archive-3.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-3.md)
- [Decision Log Archive 2 (.agents/log-archive-2.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-2.md)
- [Decision Log Archive 1 (.agents/log-archive-1.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-1.md)

