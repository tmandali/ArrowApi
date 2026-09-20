# Report Lifecycle & Server-Sent Events (SSE) Architecture

This document explains the unified single-page report flow, asynchronous job lifecycle, and Server-Sent Events (SSE) live streaming mechanism.

---

## 1. Single-Page Unified Report Architecture

Every report view lives under a single canonical route: `src/app/<workspace>/<report>/page.tsx`.
Legacy `/[jobId]` subdirectories are deprecated and redirect to the `?jobId=<guid>` URL query parameter.

### 3 Core Visual Blocks
1. **Criteria Filter Form (`<Report>Form.tsx` & `<Report>Filter.tsx`):**
   Handles manual user filter inputs and AI-driven schema field population.
2. **Unified Execution Panel (`<ArrowJobExecutionsPanel />`):**
   - **Left Side:** Execution history list (date, duration, row count, status icon).
   - **Right Side:** Selected job's criteria details and live progress steps (`<RunProgressSteps />`).
   - Hover trash icon on `Completed`, `Failed`, and `Cancelled` jobs; live `Cancel` action for `Running` jobs.
3. **Result Grid Panel (`<ArrowJobResultPanel />` & `<ArrowReportGrid />`):**
   Renders large data with zero main-thread memory overhead via DuckDB WASM and the OPFS disk cache.

---

## 2. Server-Sent Events (SSE) Live Stream

### Backend (`src/Arrow.Jobs.AspNetCore/ArrowJobSse.cs`)
- **Endpoint:** `GET /api/arrow/jobs/{jobId}/events` (`Content-Type: text/event-stream`).
- **Anti-Buffering Headers:**
  - `Cache-Control: no-cache, no-transform`
  - `X-Accel-Buffering: no`
  - `Connection: keep-alive`
- **Immediate Transmission:** Immediately calls `await response.Body.FlushAsync(cancellationToken)` after writing each event, preventing reverse proxies or Next.js middleware from buffering chunks.
- **Supported Events:** `status`, `info`, `progress`, `completed`, `failed`, `cancelled`.
- **Connection Handshake:** Replays historical event logs (`event-log`) first, then transitions smoothly into live streaming.

---

## 3. Client Event Dispatcher (`ArrowJobEventHub`)

Located in `src/features/jobs/services/arrow-job-event-hub.ts`, `ArrowJobEventHub` is a native `EventTarget`-based singleton Pub/Sub service independent of the React lifecycle.

### Core Capabilities
- **Deduplication:** Only one SSE connection is established per `jobId`, regardless of how many UI components subscribe.
- **Replay:** Late-subscribing components immediately receive the most recent snapshot upon connection.
- **0ms Instant First Step:** When a job is triggered (`initialPhase === "running"`), the `Running — status` step is written to the local snapshot at 0 ms before the network handshake completes.
- **Micro-Rhythm (Visual Tempo):** When backend preparation steps (`status`, `info`) arrive within 2 ms in the same TCP packet, a ~70 ms visual delay is inserted between steps so React does not flash them in a single frame.
- **High-Frequency Progress:** Row count progress events stream at full speed without artificial delay; UI notifications are throttled to ~60 ms for smooth 60 FPS rendering.

---

## 4. Job State Management (`active-jobs-store.ts`)

A Zustand-based store tracks active jobs globally:
- Statuses: `Queued`, `Running`, `Completed`, `Failed`, `Cancelled`.
- `isTerminalJobStatus(status)` confirms whether a job has reached its final state:
  - `Completed`, `Failed`, `Cancelled` $\rightarrow$ Terminal states.
