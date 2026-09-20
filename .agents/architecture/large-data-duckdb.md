# Big Data Reporting & DuckDB WASM Architecture

This document explains how large analytical datasets (hundreds of thousands of rows) are processed directly inside the browser using W3C OPFS disk caching and DuckDB WASM, along with AI exploration safety constraints.

---

## 1. Architectural Overview

In traditional web applications, large tabular datasets are downloaded as JSON, freezing the browser tab and consuming gigabytes of memory. In Yula, the shared `<ArrowReportGrid />` component is built on two core technologies:

1. **W3C OPFS (Origin Private File System):** A high-speed, sandboxed private file system on the user's local disk.
2. **DuckDB WASM:** A full-featured in-process analytical SQL engine compiled to WebAssembly running inside the browser.

```
[Backend (Arrow IPC Stream)] 
         │
         ▼
[W3C OPFS Disk Cache (Parquet / Arrow)] 
         │
         ▼
[DuckDB WASM Engine (In-Browser SQL)]
         │
         ▼
[Virtual Scrolling & <ArrowReportGrid />]
```

---

## 2. Zero-Network Re-Open (F5 / Disk Cache)

- Once a report runs, data streams directly into local OPFS storage.
- When the user refreshes the page (F5) or revisits the job (`?jobId=...`), the data is NOT re-requested from the server.
- DuckDB WASM opens the local file handle and queries data directly from disk, achieving zero network transfer and zero server compute.

---

## 3. AI Exploration Limit (Max 10 Records Rule)

> [!IMPORTANT]
> **Max 10 Records Sampling Rule:**
> In AI-driven exploration queries (`run_expert_sql`, `analyze_grid_data`), schema inspections (`get_report_schema`, `sampleRows`), or job execution lists (`list_report_executions`), **NEVER return more than 10 records to the model context**.

### Reasons for this Rule
- **Context Bloat:** Dumping thousands of rows into the LLM context window exhausts token limits.
- **Hallucination Prevention:** Excessive tabular data causes models to lose attention and miscalculate summaries.
- **Latency:** Large payloads increase JSON serialization and transfer time significantly.

Aggregations, groupings, and statistics must be executed inside DuckDB WASM; only the aggregated 10-row summary may be passed to the LLM.

---

## 4. Grid Capabilities & Actions

The `<ArrowReportGrid />` component registers as `result_grid:active` and exposes the following actions:

- `RUN_SQL`: Executes analytical SQL queries on DuckDB WASM.
- `FILTER` / `APPLY_FILTERS`: Applies column-level filter rules.
- `SORT`: Multi-column sorting.
- `COLUMNS` / `PIN`: Column visibility and pinning.
- `RESET_LAYOUT`: Restores default table configuration.
- `EXPORT`: Exports dataset to Excel, CSV, or Parquet.
- `VISUALIZE`: Generates charts from SQL results.
- `ANALYZE` / `PROFILE`: Computes column data distributions and statistical profiles.
