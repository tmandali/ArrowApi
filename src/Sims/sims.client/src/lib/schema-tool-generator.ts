import type { YulaReportCardConfig } from "@/components/layout/yula-components-data";
import { toolRegistry, type ToolDefinition, type ToolParameter } from "@/lib/tool-registry";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { parseCriteriaSchema, createInitialCriteriaRows } from "@/features/report-criteria";
import type { CriteriaFilterRow } from "@/features/report-criteria/types";

/**
 * Converts a report's JSON Schema into a ToolDefinition and registers it into toolRegistry.
 */
export function registerReportSchemaTool(config: YulaReportCardConfig): () => void {
  const toolName = `filter_${config.scope.replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const properties: Record<string, ToolParameter> = {};

  const schemaProperties = config.schema.properties ?? {};
  for (const [key, prop] of Object.entries(schemaProperties)) {
    const rawType = Array.isArray(prop.type) ? prop.type[0] : prop.type || "string";
    let paramType: ToolParameter["type"] = "string";
    if (rawType === "number" || rawType === "integer") paramType = "number";
    else if (rawType === "boolean") paramType = "boolean";
    else if (rawType === "array") paramType = "array";
    else if (rawType === "object") paramType = "object";

    const p = Array.isArray(prop) ? prop[0] : prop;
    const itemsProp = p.items && !Array.isArray(p.items) ? p.items : undefined;
    const enumValues = p.enum || itemsProp?.enum;

    let desc = p.title ? `${p.title}: ${p.description || ""}`.trim() : (p.description || key);
    
    // Semantic AI Schema Extensions
    const aiDirective = (p as any)["x-ai-directive"];
    if (aiDirective) {
      desc += ` [AI Kuralı: ${aiDirective}]`;
    }
    const aiSuggestions = (p as any)["x-ai-suggestions"];
    if (Array.isArray(aiSuggestions) && aiSuggestions.length > 0) {
      desc += ` [Öneriler: ${aiSuggestions.join(", ")}]`;
    }

    properties[key] = {
      type: paramType,
      description: desc,
      enum: enumValues ? enumValues.map(String) : undefined,
    };
  }

  let toolDescription = `${config.title} raporunun kriterlerini doldurur ve sohbet kartında görüntüler. ${config.description || ""}`;
  const rootAiDirective = config.schema["x-ai-directive"];
  if (rootAiDirective) {
    toolDescription += ` [AI Direktifi: ${rootAiDirective}]`;
  }

  const toolDef: ToolDefinition = {
    name: toolName,
    description: toolDescription.trim(),
    parameters: {
      type: "object",
      properties,
      required: config.schema.required,
    },
    execute: (args: Record<string, any>) => {
      console.log(`[SchemaToolGenerator] Executing ${toolName} with args:`, args);

      // 1. Şemanın varsayılan alanlarını (required ve default değerler: örn. Para Birimi = TRY) al
      const parsed = parseCriteriaSchema(config.schema);
      const initialDefaultRows = createInitialCriteriaRows(parsed.fields);

      // 2. Mevcut taslak veya şema varsayılanları ile başla
      const currentRows = useDraftCriteriaStore.getState().rowsByScope[config.scope] || initialDefaultRows;

      // 3. Varsayılan alanları koruyan satır haritası kur
      const rowMap = new Map<string, CriteriaFilterRow>();
      for (const row of initialDefaultRows) {
        if (row.name) {
          rowMap.set(row.name, { ...row });
        }
      }
      for (const row of currentRows) {
        if (row.name && row.value !== "") {
          rowMap.set(row.name, { ...row });
        }
      }

      // 4. AI'ın sağladığı filtreleri üzerine yaz veya yeni satır olarak ekle
      for (const [key, val] of Object.entries(args)) {
        if (val !== undefined && val !== null && val !== "") {
          const stringVal = Array.isArray(val) ? val.join(", ") : String(val);
          const existing = rowMap.get(key);
          if (existing) {
            existing.value = stringVal;
          } else {
            rowMap.set(key, {
              id: `ai-${key}-${Date.now()}`,
              selected: false,
              name: key,
              value: stringVal,
            });
          }
        }
      }

      const mergedRows = Array.from(rowMap.values());
      useDraftCriteriaStore.getState().setRows(config.scope, mergedRows);

      return {
        status: "success",
        customKind: config.kind,
        scope: config.scope,
        pagePath: config.pagePath,
        title: config.title,
        appliedFilters: args,
      };
    },
  };

  return toolRegistry.register(toolDef);
}

/**
 * Registers all configured report schemas as dynamic tools in toolRegistry.
 */
export function registerAllReportSchemaTools(configs: YulaReportCardConfig[]): () => void {
  const unregisterFns = configs.map((cfg) => registerReportSchemaTool(cfg));
  return () => {
    unregisterFns.forEach((fn) => fn());
  };
}
