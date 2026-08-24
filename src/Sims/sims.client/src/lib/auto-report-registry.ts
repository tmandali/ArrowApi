import type { JsonSchemaObject } from "@/features/report-criteria";
import { registerGenericReportTools } from "@/lib/schema-tool-generator";
import { registerDuckDbChatTool } from "@/lib/duckdb-chat-tool";

export interface YulaReportCardConfig {
  kind: string;
  scope: string;
  workspace?: string;
  title: string;
  description?: string;
  pagePath: string;
  schema: JsonSchemaObject;
}

// In-memory registry of all automatically discovered report card configs
export const autoReportCardConfigs: YulaReportCardConfig[] = [];

/**
 * Auto-discovers all `*-criteria.schema.json` files in the codebase using Vite's glob import
 * and registers them as dynamic tools in toolRegistry and Yula chat cards.
 */
export function initAutoReportRegistry(): () => void {
  const schemaModules = import.meta.glob<Record<string, any>>(
    "/src/features/**/schemas/*-criteria.schema.json",
    { eager: true }
  );

  const cleanupFns: Array<() => void> = [];

  // Register DuckDB in-chat analysis tool
  const unregisterDuckDbTool = registerDuckDbChatTool();
  cleanupFns.push(unregisterDuckDbTool);

  for (const [path, mod] of Object.entries(schemaModules)) {
    const schema = (mod.default || mod) as JsonSchemaObject & {
      "x-scope"?: string;
      "x-workspace"?: string;
      "x-page-path"?: string;
      "x-custom-kind"?: string;
    };

    if (!schema || typeof schema !== "object") continue;

    // Derive scope and workspace from path or schema annotations
    const pathParts = path.split("/");
    const filename = pathParts.pop()?.replace("-criteria.schema.json", "") || "report";
    const featureWorkspace = pathParts[3] || "stock";
    const workspace = schema["x-workspace"] || featureWorkspace;
    const scope = schema["x-scope"] || filename;
    const kind = schema["x-custom-kind"] || `yula.report.${scope}`;
    const title = schema.title || scope;
    const description = schema.description || `${title} rapor kriterleri`;
    const pagePath = schema["x-page-path"] || `/${workspace}/${scope}`;

    const config: YulaReportCardConfig = {
      kind,
      scope,
      workspace,
      title,
      description,
      pagePath,
      schema,
    };

    // Avoid duplicate configs
    const existingIdx = autoReportCardConfigs.findIndex((c) => c.scope === scope);
    if (existingIdx >= 0) {
      autoReportCardConfigs[existingIdx] = config;
    } else {
      autoReportCardConfigs.push(config);
    }
  }

  // Rapor başına araç YERİNE tek çift jenerik araç (prepare/run)
  cleanupFns.push(registerGenericReportTools(autoReportCardConfigs));
  console.log(`[AutoReportRegistry] ${autoReportCardConfigs.length} rapor → jenerik prepare_report_criteria / run_report araçlarına bağlandı`);

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}
