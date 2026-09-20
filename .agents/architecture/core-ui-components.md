# Core UI Components & Platform Architecture

This document serves as the comprehensive architectural guide for the primary user interface systems in Yula: the **Virtual Spreadsheet / Grid**, the **Schema-Generated Criteria Form**, and the **Yula Client & Yula AI** runtime ecosystem.

---

## 1. Virtual Spreadsheet / Grid (`<VirtualSpreadsheet />` & `<ArrowReportGrid />`)

The tabular reporting experience in Yula combines the reactive simplicity of **Airtable** with the computational power and keyboard fluidity of **Microsoft Excel**, powered natively by in-browser WebAssembly.

### Key Capabilities & Mechanics
- **Zero-Reflow Text Measurement:** Uses an off-screen HTML5 Canvas 2D context (`column-sizing.ts`) to calculate precise column widths. Never inserts hidden DOM nodes or calls `getBoundingClientRect()`, ensuring 60 FPS rendering during high-speed data streams.
- **Bi-Directional Virtualization:** Renders only visible rows and columns in the DOM window (`use-grid-scroll-sync.ts`), smoothly navigating hundreds of thousands of records without memory leaks.
- **Airtable-Style Column Aggregations (`TableFooterSummaryRow.tsx`):**
  - Sticky bottom footer calculating one-pass aggregations: `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `DISTINCT`.
  - Driven by DuckDB WASM SQL push-down for massive datasets, falling back to instant client-side evaluation for small sets.
- **Excel-Style Interactions:**
  - Range selection, drag-selection, and multi-cell copy (`use-cell-selection.ts`).
  - Full keyboard traversal (`ArrowUp`, `ArrowDown`, `Tab`, `Enter`, `Home`, `End`).
- **Flexible Column Management (`ColumnManagementMenu.tsx`):**
  - Interactive reordering via HTML5 Drag & Drop (`use-column-reorder.ts`).
  - Left-to-right priority column pinning (frozen columns).
  - Searchable visibility toggling, hiding, and layout reset.
  - Persistent state in `localStorage` with 250 ms debounced saves (`use-persist-grid-state.ts`).
- **Multi-Column Sorting (`use-multi-sort.ts`):** Supports multi-tier sort chains synced directly with DuckDB `ORDER BY` clauses.
- **AI SQL Views (`AiViewDropdown.tsx`):** Dynamic user and AI-generated SQL perspectives (`active_view`, saved analytical views) rendered on the fly.
- **Zero-Network Cache:** Integrates W3C Origin Private File System (OPFS) and DuckDB WASM. Once downloaded, datasets open instantly from local disk across browser refreshes (F5).

---

## 2. Schema-Generated Criteria Screen (`report-criteria`)

Report filter screens are strictly **schema-driven**; form interfaces are never hand-coded or hardwired with static HTML inputs.

### Architecture & Mechanics
- **Declarative JSON Schema Contract:** Defined under `schemas/<report>-criteria.schema.json`.
- **Dynamic Form Generation (`SchemaCriteriaFilterGroup.tsx`):**
  - Evaluates JSON Schema properties and generates typed input components automatically.
  - Validates constraints bidirectionally using Zod preflight contracts before network transmission.
- **Specialized Input Controls:**
  - `CriteriaDateValueCell.tsx`: Range date selectors with preset business shortcuts (Today, This Week, Month-End, Year-to-Date).
  - `CriteriaGridCellCombobox.tsx`: High-performance asynchronous search comboboxes with keyboard paging and badge displays.
  - Advanced syntax parsing (D365/Business Central syntax: `10..50`, `P*`, `|` OR unions).
- **AI Grounding Directives (`x-ai`):**
  - `aliases`: Multi-name synonym triggers for intent recognition.
  - `quickPrompts`: Dynamic criteria starter suggestions.
  - `resultsPrompts`: Iterative data analysis prompts suggested upon query completion.
  - `columnHints`: Semantic definitions and units assisting LLM SQL generation.
  - `analysisTopics`: Playbook topics powering iterative exploratory workflows.
- **Headless AI Binding:** Registers as `criteria_form:<scope>` via `@my-agent/react`'s `useAgentComponent`, enabling typed programmatic manipulation (`SET_FIELDS`, `SUBMIT`).

---

## 3. Yula Client & Yula AI Platform Ecosystem

The application architecture bridges standard business views with an intelligent UI-Agent copilot.

```
┌─────────────────────────────────────────────────────────────┐
│                    Yula Client (Shell)                      │
│  Next.js 15 App Router • Global Navigation • i18n Dictionary│
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌─────────────────────────────┐ ┌─────────────────────────────┐
│    Domain Workspaces        │ │      Yula AI Assistant      │
│  src/workspaces/<workspace> │ │  @my-agent/react Side Dock  │
├─────────────────────────────┤ ├─────────────────────────────┤
│ • Single-Page Reports       │ │ • ReAct & Plan-First Modes  │
│ • Unified Execution Panel   │ │ • 6 Standard Tools Pipeline │
│ • DuckDB VirtualSpreadsheet │ │ • Inline Choice Cards (HITL)│
│ • Module Federation Remotes │ │ • Procedural Wiki Memory    │
└─────────────────────────────┘ └─────────────────────────────┘
```

### Yula Client Foundations (`src/Sims/yula.client/`)
- **Shell vs. Workspace Separation:** Shell handles routing, sidebar, and layout; domain workspaces (`stock`, `selling`, `accounting`) hold business logic behind clean `index.ts` public APIs.
- **Single-Page Unified Architecture:** Reroutes criteria, job execution history, live SSE steps, and result grids onto a single page: `src/app/<workspace>/<report>/page.tsx?jobId=<guid>`.
- **Internationalization (`next-intl`):** Pure language-agnostic components; all text dynamically resolves from `messages/*.json`.

### Yula AI Engine (`@my-agent/core` & `@my-agent/react`)
- **Side Dock Standard:** Persistent, non-blocking drawer UI that preserves screen visibility without full-page modal takeover.
- **Dual Operating Modes:**
  - **Plan-First (Global Scope):** Proposes structured plans with interactive `YulaChoiceCard` approvals before execution.
  - **Direct ReAct (Screen Scope):** Rapid execution (`SET_FIELDS` $\rightarrow$ `SUBMIT`) with live status chips (`Reasoning…` / `Acting…`).
- **Inline Human-in-the-Loop (HITL):** Popup modals are strictly banned; all decisions and confirmations render inline as interactive chips preserving full audit history.
- **Procedural Playbook Memory:** Multi-tiered wiki rules (`storage/wiki/...`) guide workflows, eliminating repetitive exploratory queries.
- **High-Performance Chat Markdown & Mermaid Engine (`ChatMarkdown`):**
  - Uses `marked.lexer` block splitting and `React.memo` to sustain 60 FPS during fast LLM token streaming.
  - Transforms specialized action protocols (`yula-prompt:`, `yula-report:`, `yula-file:`, `yula-criteria:`) into interactive chips.
  - Dynamically renders Mermaid diagrams (`language === "mermaid"`) on demand using lazy-loaded `MermaidBlock` with light/dark theme synchronization, zoom controls, and a dual-mode `[Diagram / Code]` switcher.
