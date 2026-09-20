# Mandatory Checklist for Adding Reports / Agents

Follow these 6 steps **in exact order without exception** whenever adding a new report or AI agent capability to the project:

---

## 📋 6-Step Mandatory Checklist

### 1. JSON Schema Definition (`schemas/<report>-criteria.schema.json`)
The criteria schema must include standard metadata and AI grounding directives:
- `x-scope`: Unique report identifier (e.g., `"stock:balance"`).
- `x-page-path`: Web route of the report (e.g., `"/stock/stock-balance"`).
- `x-job-endpoint`: Backend execution endpoint.
- `x-ai`: Grounding and intent matching directives:
  - `aliases`: Alternate search names (e.g., `["stock balance", "inventory status"]`).
  - `quickPrompts`: Starter questions shown in criteria mode.
  - `resultsPrompts`: Analysis prompts suggested once results load.
  - `columnHints`: Data types and domain meaning of columns.
  - `analysisTopics`: Iterative analysis topics (`id`, `title`, `goal`, `tool`, `columns`, `followUp`).

### 2. YAML Agent Manifest (`src/workspaces/<workspace>/agents/<name>.agent.yaml`)
- Define declarative YAML manifests for workspace commands and agent capabilities.
- Never hardcode commands or system prompts in application logic.

### 3. Report Registration (`src/features/reports/report-registry.ts`)
1. Export the created JSON schema through the workspace's root `index.ts` (Public API rule).
2. Register it in `REGISTERED_REPORTS`:
   ```ts
   {
     scope: "stock:balance",
     workspace: "stock",
     title: "Stock Balance Report",
     pagePath: "/stock/stock-balance",
     aliases: ["stock balance", "inventory"],
     fullSchema: stockBalanceCriteriaSchema,
   }
   ```

### 4. Next.js Route Page (`src/app/<workspace>/<report>/page.tsx`)
- Implement the single-page unified standard supporting `?jobId=<guid>`.
- Consolidate criteria form, execution history panel, and result grid into one view.
- Redirect legacy paths using Next.js `redirect`.

### 5. Result View Component (`<Report>ResultGrid.tsx`)
- Build the report result view on top of the shared `<ArrowReportGrid />` component:
  ```tsx
  <ArrowReportGrid
    jobId={jobId}
    jobUrl={reportUrl}
    reportScope="stock:balance"
    allowExport
    allowVisuals
  />
  ```
- Bind it to the Form's `renderResult` prop.

### 6. Path & Label Formatting (`src/lib/workspace-paths.ts`)
- Add the localized navigation label to `formatPathnameLabel(pathname)`:
  ```ts
  if (pathname.includes("/stock/stock-balance")) return "Stock Balance Report";
  ```
