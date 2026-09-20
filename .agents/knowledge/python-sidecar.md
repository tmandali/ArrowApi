# Embedded Python AI Sidecar Architecture [TO-BE]

> [!WARNING]
> **Status: TO-BE / Future Roadmap (Currently Inactive)**  
> This capability is currently out of active scope. Do NOT implement, prioritize, or generate code for the Python sidecar process unless explicitly requested by the user.

---

## 1. Architectural Overview (Target State)

For intensive data science tasks, statistical anomalies, and local machine learning models, the client may spawn a managed Python sidecar subprocess in future iterations.

- **Transport:** Standard streams (`sys.stdin` / `sys.stdout`) exchanging line-delimited JSON messages.
- **Protocol:** Synchronous and asynchronous request-response pairing inspired by JSON-RPC 2.0.
- **Bridge:** Seamless bidirectional invocation managed through `toolRegistry`.

```
[Next.js / Tauri Client] 
         │  (stdin JSON)
         ▼
[Python AI Sidecar Process] 
         │  (stdout JSON)
         ▼
[Tool Registry & Client UI]
```

---

## 2. Bidirectional Tool Calling

The subprocess is not merely a passive command receiver; it can invoke frontend tools dynamically during an analytical task:

1. Client $\rightarrow$ Python: "Detect anomalies in current inventory."
2. Python $\rightarrow$ Client: `toolRegistry.call("get_duckdb_sample", { limit: 10 })`
3. Client $\rightarrow$ Python: Returns 10 sample records from DuckDB WASM.
4. Python $\rightarrow$ Client: Returns computed anomaly scores and insights.

---

## 3. Process Lifecycle & Resilience

- When the host application closes, standard `SIGTERM` / `SIGINT` signals ensure the Python process terminates cleanly without leaving orphan instances.
- Transient subprocess crashes trigger automated backoff restarts with isolated error reporting.
