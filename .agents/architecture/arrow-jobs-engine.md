# Arrow Jobs Engine & Distributed Execution Architecture

This document details the architecture of the **Arrow Jobs Engine**—the .NET backend asynchronous distributed job system and its seamless integration with the Next.js frontend (`yula.client`).

---

## 1. Architectural Overview & Purpose

Analytical queries, heavy data exports, and ERP reports cannot be executed synchronously over standard HTTP request-response cycles due to timeout risks, thread exhaustion, and browser freezing.

The **Arrow Jobs Engine** decouples report execution into an asynchronous, streaming, event-driven pipeline:

```
[Next.js Client (yula.client)]
         │
         │ 1. POST /api/arrow/{jobName} (Criteria JSON)
         ▼
[Arrow.Jobs.AspNetCore (Minimal APIs)] ── 202 Accepted (jobId, URLs) ──► Client
         │
         │ 2. Enqueue Job
         ▼
[IArrowJobQueue (Redis / Postgres / InMemory)]
         │
         │ 3. Dequeue & Execute
         ▼
[ArrowJobHostedService & IArrowJobWorker<T>]
         │
         ├─► 4. Stream Progress Events ──► IArrowJobEventHub ──► SSE Stream (/events)
         │
         └─► 5. Write Arrow RecordBatches ──► IArrowJobResultStorage (Disk / OPFS)
```

---

## 2. .NET Backend Solution Topology

The backend consists of modular .NET libraries:

| Project | Responsibility | Key Types |
| :--- | :--- | :--- |
| **`Arrow.Jobs.Abstractions`** | Core contracts, models, and interfaces. Zero third-party web dependencies. | `ArrowJob<TRequest>`, `ArrowJobState`, `ArrowJobStatus`, `IArrowJobWorker<T>`, `IArrowJobQueue`, `IArrowJobStore`, `IArrowJobEventHub`, `IArrowJobResultStorage`. |
| **`Arrow.Jobs.AspNetCore`** | Minimal API endpoint routing, SSE streaming handlers, hosted execution engine, and file retention. | `ArrowJobEndpoints.UseArrowApi()`, `ArrowJobSse`, `ArrowJobHostedService`, `DefaultArrowJobExecutionContext`. |
| **`Arrow.Jobs.InMemory`** | In-memory implementations for local development, fast testing, and single-instance deployments. | `InMemoryArrowJobQueue`, `InMemoryArrowJobStore`, `InMemoryArrowJobEventHub`. |
| **`Arrow.Jobs.Postgres`** | Persistent PostgreSQL storage for job state, execution history, and audit metadata. | Dapper / EF Core stores. |
| **`Arrow.Jobs.Redis`** | Distributed queueing and high-performance Pub/Sub event broadcasting across worker nodes. | `RedisArrowJobQueue`, `RedisArrowJobEventHub`. |

---

## 3. Job Lifecycle & State Machine

Every job transitions through well-defined lifecycle states:

```
[Queued] ──► [Running] ──┬──► [Completed] (Terminal)
                         ├──► [Failed]    (Terminal)
                         └──► [Cancelled] (Terminal)
```

- **`Queued`**: Job created, hash-deduplicated, and waiting in `IArrowJobQueue`.
- **`Running`**: Picked up by an `IArrowJobWorker`. W3C distributed tracing spans (`TraceId`, `ParentSpanId`) are propagated.
- **`Completed`**: Worker finished yielding Apache Arrow `RecordBatch` streams. Result payload is sealed.
- **`Failed`**: Worker encountered an unhandled exception; error details captured.
- **`Cancelled`**: Job was aborted by user action or timeout via cancellation token.

---

## 4. Backend Minimal API Endpoints

Mapped via `app.UseArrowApi("/api/arrow")`:

- `POST /api/arrow/{jobName}`: Initiates a job. Returns `202 Accepted` with `ArrowJobStatus` DTO and `Location: /api/arrow/jobs/{jobId}`.
- `GET /api/arrow/jobs/{jobId}`: Polls job status or downloads Apache Arrow IPC binary stream when `Completed`.
- `GET /api/arrow/jobs/{jobId}/events`: Live Server-Sent Events (SSE) stream (`text/event-stream`).
- `GET /api/arrow/jobs/{jobId}/event-log`: Replays past event history.
- `POST /api/arrow/jobs/{jobId}/cancel`: Cancels an active or queued job.
- `POST /api/arrow/jobs/{jobId}/retry`: Re-queues a failed or cancelled job.
- `GET /api/arrow/jobs/{jobId}/request`: Retrieves the original JSON criteria.

---

## 5. Frontend Usage & Integration (`yula.client`)

The Next.js client interacts with the Arrow Jobs Engine through high-level abstractions:

### A. Client Service (`src/features/jobs/arrow-job-client.ts`)
Encapsulates HTTP requests and fetch streams:
- `createArrowJob(endpoint, criteria)`: Dispatches the job creation POST.
- `getArrowJobStatus(jobUrl)`: Fetches live status DTO.
- `cancelArrowJob(jobId)`: Sends cancellation POST.
- `readJobSseEvents(eventsUrl, onEvent)`: Consumes the SSE stream.

### B. Singleton Event Hub (`src/features/jobs/services/arrow-job-event-hub.ts`)
- **Deduplication:** Multiple components listening to the same `jobId` share a single SSE connection.
- **0ms Instant Feedback:** Injects an instant `Running` status on connection before network roundtrips finish.
- **Micro-Rhythm (~70ms):** Smooths high-frequency backend event bursts to prevent React frame drops.

### C. Large Data Visualization (`<ArrowReportGrid />`)
- Once the job completes, data streams directly into the browser's **W3C OPFS** (Origin Private File System).
- **DuckDB WASM** mounts the file directly from local disk, providing instant SQL filtering, aggregations, and exports with zero server load and zero memory pressure.

### D. Single-Page URL Binding
- Every report binds to `src/app/<workspace>/<report>/page.tsx?jobId=<guid>`.
- History panel (`<ArrowJobExecutionsPanel />`), live steps (`<RunProgressSteps />`), and DuckDB grid (`<ArrowReportGrid />`) live unified on a single screen.
