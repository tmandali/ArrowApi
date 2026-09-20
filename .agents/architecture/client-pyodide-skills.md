# Client Pyodide Skills & Event Hub Architecture (ADR)

> **Status:** Active / Enforced  
> **Applicability:** Next.js Client (`src/Sims/yula.client`), UI Agent (`yula-ai`), DuckDB WASM, Custom User Skills

---

## 1. System Topology Graph

```mermaid
graph TD
    UI[Next.js UI & Agent Chat] -->|dispatchRun| HUB[SkillEventHub (EventTarget)]
    HUB -->|Worker PostMessage| WORKER[Pyodide Web Worker (WASM Sandbox)]
    WORKER -->|stdout / stderr stream| HUB
    WORKER -->|result / error| HUB
    HUB -->|CustomEvent / Snapshot| UI
    
    DUCKDB[DuckDB WASM & OPFS] -->|Arrow RecordBatch / JSON| BRIDGE[DuckDB-Pyodide Bridge]
    BRIDGE -->|dispatchRun with Table Data| HUB
    
    STORE[SkillStore (Zustand Persist)] -->|Draft Skills (Local)| UI
    STORE -->|Release Action| BACKEND[Sims.Server DB Sync]
    
    UI -->|Abort / Timeout Signal| HUB
    HUB -->|worker.terminate()| WORKER
```

---

## 2. Nodes Catalog

### `Node:SkillEventHub`
- **Role:** Singleton event broker and Pub/Sub manager extending native `EventTarget`.
- **Inbound Contracts:**
  - `dispatchRun(skillName: string, code: string, options?: SkillRunOptions): string`
  - `abort(executionId: string): void`
- **Outbound Contracts:**
  - Dispatches `CustomEvent("skill:<executionId>")` with `SkillHubEventDetail` (logs, progress, snapshot, completion).
  - Manages Web Worker lifecycle with 30s timeout watchdog.

### `Node:PyodideWorker`
- **Role:** Isolated Web Worker running CPython compiled to WebAssembly.
- **Pre-installed Packages:** `pandas`, `openpyxl`, `numpy`, `micropip`.
- **Security Invariant:** Zero host OS access, zero raw network sockets, strict browser sandbox.

### `Node:DuckDbPyodideBridge`
- **Role:** Zero-copy / tabular bridge linking DuckDB WASM query outputs to Pyodide pandas DataFrames (`df`).
- **Inbound:** SQL query or table name + user Python analysis script.
- **Outbound:** Dispatches execution to `SkillEventHub`.

### `Node:SkillStore`
- **Role:** Zustand store with `persist` middleware governing skill lifecycle.
- **Lifecycle Flow:**
  - `Draft`: Kept in client browser storage (`IndexedDB` / `localStorage`).
  - `Released`: Promoted by user, synced to `Sims.Server` database for organization-wide availability.

---

## 3. Edges & Flow Dynamics

1. **Reactive Execution Stream:** `UI -> SkillEventHub -> Worker -> SkillEventHub -> UI`.
   - Streaming logs (`stdout`/`stderr`) update UI dynamically without re-rendering the full page.
2. **Crash & Timeout Safety Loop:**
   - If Python code exceeds 30 seconds or enters an infinite loop (`while True:`), `SkillEventHub` triggers `worker.terminate()`, marks execution `cancelled`, and cleanly spawns a fresh worker.
3. **Neighboring References:**
   - [DuckDB WASM Architecture](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)
   - [Headless React Agent](file:///Users/tmr/Source/ArrowApi/.agents/architecture/headless-react-agent.md)
   - [Core UI Components](file:///Users/tmr/Source/ArrowApi/.agents/architecture/core-ui-components.md)
