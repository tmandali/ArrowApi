# 06 — Demo Application Architecture & Flow

Source Directory: `apps/demo-app/src/`

---

## 1. Application Entrypoint (`main.tsx`)

- **Root Structure:**
  - Manages the top-level `currentRoute` state (`/reports` vs `/dashboard`).
  - Wraps the application with `AgentProvider(apiEndpoint="/api/chat", systemName="HeadlessSalesAgent")`.
  - Mounts `DemoApp` alongside the floating `AgentWidget`.

---

## 2. Main Orchestrator (`App.tsx` — 435 Lines)

Adheres strictly to Clean Architecture constraints (under 500 lines), delegating UI rendering to specialized sub-components:

### Core State & State Machine
- `stage`: `CRITERIA` (Form stage) vs `RESULT` (Report stage).
- Form inputs: `storeId` (string) and `dateRange` (YYYY-MM regex validated).
- Safety state: `hitlEnabled` (boolean) and `pendingApproval` (modal gate payload).
- Navigation state: Handled reactively via `useAgentRouter({ currentRoute, onNavigate: setCurrentRoute })`.
- Undo / Redo: Integrated with `sessionManager.canUndo()` and `sessionManager.canRedo()`.

### Sliced UI Components ([`components/`](../apps/demo-app/src/components/))
- **[`HeaderBanner.tsx`](../apps/demo-app/src/components/HeaderBanner.tsx):** Top branding, live token/cost summary, Undo/Redo/New Session buttons, and session dump/restore controls.
- **[`CriteriaForm.tsx`](../apps/demo-app/src/components/CriteriaForm.tsx):** Stage 1 retail filter inputs with inline validation alerts.
- **[`DynamicResultGrid.tsx`](../apps/demo-app/src/components/DynamicResultGrid.tsx):** Stage 2 sales report data grid, registered as `result_table` with `SORT` and `EXPORT_CSV` action contracts.
- **[`DashboardView.tsx`](../apps/demo-app/src/components/DashboardView.tsx):** High-level KPI summary, branch performance metrics, and `dashboard_kpi` actions.
- **[`HitlModal.tsx`](../apps/demo-app/src/components/HitlModal.tsx):** Human-in-the-Loop confirmation dialog pausing side-effecting operations.
- **[`PiTestPanel.tsx`](../apps/demo-app/src/components/PiTestPanel.tsx):** Dedicated testing panel triggering 14 discrete architectural simulations.
- **[`PiEventWaterfall.tsx`](../apps/demo-app/src/components/PiEventWaterfall.tsx):** Live hierarchical tree visualizing upstream telemetry and downstream tool events.
- **[`ActionLogViewer.tsx`](../apps/demo-app/src/components/ActionLogViewer.tsx):** Real-time terminal log viewer.

---

## 3. Server-Side Chat Middleware (`vite.config.ts`)

- Endpoint: `POST /api/chat`
- **Dynamic Context Injection:**
  Extracts `uiContext` (`active_components`, `recent_events`, `route`) from the incoming request body and formats the LLM system prompt using `formatActiveComponentsPrompt()`, `skillsManager.formatSkillsPrompt()`, and `agentMemory.formatMemoryPrompt()`.
- **Model Execution:**
  Streams responses via Vercel AI SDK (`streamText`) connected to the active model specified in `models.json` (e.g. Agnes AI, OpenRouter, Claude, or OpenAI).
- **Server Tools:**
  Dynamically binds the 6 Standard Tools via `createAgentToolsForServer()`, executing runtime Zod validation and preflight checks on all actions.

---

## 4. Configuration & Secret Isolation

- **`apps/demo-app/models.json`:** Declares providers and available models (no API keys allowed).
- **`apps/demo-app/auth.json`:** Secure credential store (managed with `0600` permissions and never committed).
- **Global Fallback:** Automatically resolves credentials and models from `~/.epic-volta/` or system `~/.pi/agent/` if local files are absent.

---

## 5. Development & Verification CLI Commands

```bash
# Start local development server with hot-reload
pnpm dev

# Run strict monorepo typecheck
pnpm -r typecheck

# Run unit tests across all packages
pnpm -r test

# Verify production client build
pnpm --filter demo-app build
```
