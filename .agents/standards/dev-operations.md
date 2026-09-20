# Development Operations & Process Lifecycle

This document specifies the standard local development runtime configuration, well-known ports, and instant shutdown protocols for ArrowApi, Sims, and Yula applications.

---

## 1. Well-Known Local Ports & Runtimes

Development servers operate on deterministic port allocations across the repository:

| Service / Project | Framework / Tooling | Launch Command | Default Port(s) |
| :--- | :--- | :--- | :--- |
| **`yula.client`** | Next.js 16 (Turbopack) | `pnpm run dev:next` | **`56402`** |
| **`Sims.Server`** | ASP.NET Core (.NET 10) | `dotnet run` (SpaProxy launches `yula.client`) | **`5168`** (HTTP), **`7137`** (HTTPS) |
| **`yula-ai` Demo App** | Vite / React | `pnpm --filter demo-app dev` | **`3000`** |

> [!IMPORTANT]
> The ASP.NET Core `Sims.Server` project uses `Microsoft.AspNetCore.SpaProxy` configured in `Sims.Server.csproj` with:
> - `<SpaRoot>..\yula.client</SpaRoot>`
> - `<SpaProxyServerUrl>http://localhost:56402</SpaProxyServerUrl>`
> Running `dotnet run` in `Sims.Server` automatically spawns `pnpm run dev:next` on port `56402`.

---

## 2. Instant Project Shutdown Protocol ("Proje Kapat")

When the user requests to stop or shut down the project (e.g. *"proje kapat"*, *"projeyi kapat"*, *"stop project"*):

### ⛔ Prohibited Behavior
- **Do NOT perform exploratory port discovery** (`ps aux`, iterative `lsof` scans, or multi-step queries).
- Do not hesitate or ask for confirmation unless processes fail to terminate.

### ✅ Enforced Instant Action
Execute the single-line termination sequence targeting all known project ports and process signatures simultaneously:

```bash
kill -9 $(lsof -ti:56402,3000,5168,7137) 2>/dev/null; pkill -f "dotnet run|next-server|yula.client.*next" 2>/dev/null || true
```

### Verification
Verify that listening ports are released cleanly:

```bash
lsof -iTCP -sTCP:LISTEN -P -n | grep -E "56402|3000|5168|7137" || true
```
