# ArrowApi Developer Agent Decision & Evolution Log

This document is the **append-only audit log** recording fundamental architectural decisions, major refactors, and rule updates chronologically across the repository.

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
