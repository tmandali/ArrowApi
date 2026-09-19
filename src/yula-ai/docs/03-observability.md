# 03 — Observability, Telemetry & Session Management

Source Modules: `packages/agent-core/src/{pi-event-stream,telemetry-metrics,session-replay,session-harness,session-branch,memory,compaction,truncate}.ts`

---

## 1. Pi Event Stream (`pi-event-stream.ts`)

- **Singleton:** `piEventStream`
- **Capabilities:** High-resolution event sequencing for agent lifecycle milestones (`agent_start`, `tool_call`, `tool_result`, `agent_finish`, `error`).
- **Subscribers:**
  - Powers the live visual tree in [`PiEventWaterfall.tsx`](../apps/demo-app/src/components/PiEventWaterfall.tsx).
  - Powers the diagnostic Pi Events tab inside `AgentWidget`.

---

## 2. Telemetry & Metrics Tracker (`telemetry-metrics.ts`)

- **Singleton:** `telemetryTracker`
- **Tracked Metrics:** Prompt tokens, completion tokens, round-trip API latencies, total estimated cost, and tool dispatch frequencies.
- **Surface Area:** Exposed via `getMetricsSummary()` for live display in [`HeaderBanner.tsx`](../apps/demo-app/src/components/HeaderBanner.tsx) and `MetricsTab.tsx`.

---

## 3. Session Harness & Persistence (`session-harness.ts`)

- **Singleton:** `sessionHarness`
- **Features:**
  - `newConversation()`: Resets conversation history and transient state cleanly.
  - `dumpSession()` / `restoreSession()`: Serializes full session state into JSON for debugging or snapshot comparisons.
  - `exportSessionToFile()`: Generates local snapshot downloads from the demo interface.

---

## 4. Session Branching & Time-Travel (`session-branch.ts`)

- **Singleton:** `sessionManager`
- **State Machine:**
  - `checkpoint(label, state)`: Records immutable snapshots of the UI and form state upon critical actions (e.g., report generation).
  - `undo()` / `redo()`: Navigates historical state branches.
  - `canUndo()` / `canRedo()`: Drives the reactive state of undo/redo UI buttons.
  - `onRestore(callback)`: Notifies components when a past state is loaded, restoring inputs and view stages.
- **Tool Integration:** Powers the canonical `time_travel` agent tool.

---

## 5. Session Replay Engine (`session-replay.ts`)

- **Purpose:** Enables deterministic visual replay of past agent interactions.
- **UI Component:** Visualized through [`ReplayScrubber.tsx`](../apps/demo-app/src/components/ReplayScrubber.tsx), allowing developers to step through historical frames.

---

## 6. Context Management & Memory (`memory.ts`, `compaction.ts`, `truncate.ts`)

- **Agent Memory (`agentMemory`):**
  - Manages structured facts across `session` (in-memory) and `persistent` (localStorage) scopes.
  - Supports full CRUD operations: `remember(key, value, scope)`, `recall(query)`, and `forget(key)`.
  - Injects stored preferences into prompts via `formatMemoryPrompt()`.
- **Compaction & Truncation:**
  - `compaction.ts`: Compacts older conversational turns into dense summaries while preserving crucial entities.
  - `truncate.ts`: Truncates message histories according to token budget thresholds without severing conversation flow.
