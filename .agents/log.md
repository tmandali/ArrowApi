# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

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

## 📜 Prior Decisions Archive
Older architectural decisions have been archived to adhere to the 500-line limit:
- [Decision Log Archive 4 (.agents/log-archive-4.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-4.md)
- [Decision Log Archive 3 (.agents/log-archive-3.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-3.md)
- [Decision Log Archive 2 (.agents/log-archive-2.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-2.md)
- [Decision Log Archive 1 (.agents/log-archive-1.md)](file:///Users/tmr/Source/ArrowApi/.agents/log-archive-1.md)
