# Module Federation & Workspace Architecture

This document defines workspace boundaries, the Shell (host) relationship, and preparatory guidelines for upcoming Module Federation (React Remotes).

---

## 1. Shell (Host) and Workspace Separation

- **Shell (Host):** The root application skeleton providing global routing, layout, navigation, Yula AI panel, and core system views.
- **Platform Core (`src/features/<feature>/`):** Platform-level infrastructure modules (`auth`, `jobs`, `reports`, `report-criteria`, `system`, `settings`).
- **Domain Workspaces (`src/workspaces/<workspace>/`):** Self-contained business domains (`stock`, `selling`, `subcontracting`, `accounting`, `manufacturing`).
- **Next.js App Layer (`src/app/`):** Thin wrappers only; business logic MUST NOT reside here. All domain logic must be imported from the workspace.

---

## 2. Workspace Route Standards

- `/<workspace>`: The landing view of the workspace.
- `/<workspace>/dashboard`: Standard sub-route for analytical dashboards and KPI cards.

---

## 3. Module Federation Readiness & Import Boundaries

Workspaces will eventually be split into independent **React Remotes** via Module Federation. Therefore:

> [!CAUTION]
> **Cross-Workspace Direct Imports Are Strictly Forbidden:**
> A file under `src/workspaces/stock/` must NEVER directly import from `src/workspaces/selling/components/...`.

### Public API Rule (`index.ts`)
- All components, services, schemas, and types that need to be shared externally MUST be exported from the workspace root `index.ts`.
- External consumers may only import from the root alias `@/workspaces/<workspace>`.

---

## 4. Self-Registration

Each workspace registers itself autonomously:
1. `workspace.config.ts`: Workspace metadata, icon, and baseline configuration.
2. `routes.ts`: Route hierarchy and navigation menu items.
3. `index.ts`: The public API contract.

The registry service at `src/lib/workspace-registry.ts` aggregates all workspaces dynamically.

---

## 5. Declarative YAML Agent Manifests

System commands, prompt templates, and agent definitions MUST NOT be hardcoded in application logic.
- Declare workspace agent capabilities in `src/workspaces/<workspace>/agents/*.agent.yaml`.
- The loader at `yula-commands.ts` dynamically parses manifests via raw bundler loaders and `js-yaml`.
