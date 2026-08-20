import type { JsonSchemaObject } from "@/features/report-criteria";
import { registerReportSchemaTool } from "@/lib/schema-tool-generator";
import { registerDuckDbChatTool } from "@/lib/duckdb-chat-tool";

export interface YulaReportCardConfig {
  kind: string;
  scope: string;
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
      "x-page-path"?: string;
      "x-custom-kind"?: string;
    };

    if (!schema || typeof schema !== "object") continue;

    // Derive scope from x-scope or filename
    const filename = path.split("/").pop()?.replace("-criteria.schema.json", "") || "report";
    const scope = schema["x-scope"] || filename;
    const kind = schema["x-custom-kind"] || `yula.report.${scope}`;
    const title = schema.title || scope;
    const description = schema.description || `${title} rapor kriterleri`;
    const pagePath = schema["x-page-path"] || `/reports/${scope}`;

    const config: YulaReportCardConfig = {
      kind,
      scope,
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

    const unregister = registerReportSchemaTool(config);
    cleanupFns.push(unregister);
    console.log(`[AutoReportRegistry] Auto-registered report: "${title}" (scope: ${scope}, tool: filter_${scope.replace(/[^a-zA-Z0-9_]/g, "_")})`);
  }

  return () => {
    cleanupFns.forEach((fn) => fn());
  };
}
