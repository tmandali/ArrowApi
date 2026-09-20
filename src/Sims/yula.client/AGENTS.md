<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Yula Client Developer Agent Router

This document is the **lightweight Client Router** for Yula Client frontend engineering. All system-wide architectural rules, ADR decisions, and step-by-step checklists are unified in the central wiki:

👉 **[ArrowApi Developer Agent Wiki](file:///Users/tmr/Source/ArrowApi/.agents/index.md)**

---

## ⚡ Enforced Client Rules

1. **Shadcn UI Isolation:** Never touch `src/components/ui/*` directly (strictly protected by `.oxlintrc.json`).
2. **500-Line Limit:** No file (`.tsx`, `.ts`, `.md`) may exceed 500 lines (`wc -l`).
3. **Module Boundaries:** Preserve `src/workspaces/<workspace>/` boundaries. Cross-workspace direct imports are forbidden; external consumers must use `index.ts` (Public API) only.
4. **Localization (i18n):** Never hardcode user-facing strings; resolve all labels from `messages/*.json` via `next-intl`.

---

## 📚 Essential Wiki References

- 🌐 [Master System Graph (Topology)](file:///Users/tmr/Source/ArrowApi/src/yula-ai/agent.md)
- 📋 [New Report & Agent Checklist](file:///Users/tmr/Source/ArrowApi/.agents/standards/new-report-checklist.md)
- 🎨 [Frontend Coding Standards](file:///Users/tmr/Source/ArrowApi/.agents/standards/frontend-rules.md)
- 🤖 [Headless React Agent (@my-agent)](file:///Users/tmr/Source/ArrowApi/.agents/architecture/headless-react-agent.md)
- ⚡ [Report Lifecycle & SSE](file:///Users/tmr/Source/ArrowApi/.agents/architecture/report-lifecycle-sse.md)
- 📊 [DuckDB WASM & OPFS Disk Cache](file:///Users/tmr/Source/ArrowApi/.agents/architecture/large-data-duckdb.md)
- 🧩 [Module Federation Standards](file:///Users/tmr/Source/ArrowApi/.agents/architecture/module-federation.md)
- 💬 [Inline HITL Standards](file:///Users/tmr/Source/ArrowApi/.agents/standards/inline-hitl-standards.md)
- 📖 [Procedural Memory & Playbook](file:///Users/tmr/Source/ArrowApi/.agents/knowledge/playbook-procedural-memory.md)
