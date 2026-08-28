import type { JsonSchemaObject } from "@/features/report-criteria";
import stockBalanceSchema from "@/features/stock/item/schemas/stock-balance-criteria.schema.json";

export interface YulaReportMeta {
  scope: string;
  workspace: string;
  title: string;
  pagePath: string;
  aliases: string[];
  criteriaSchema: {
    type: "object";
    properties: Record<
      string,
      { type: string; title?: string; enum?: string[]; default?: unknown }
    >;
    required?: string[];
  };
  /** Gerçek JSON Schema — job endpoint (x-job-endpoint) dahil */
  fullSchema: JsonSchemaObject;
}

export const REGISTERED_REPORTS: YulaReportMeta[] = [
  {
    scope: "stock-balance",
    workspace: "stock",
    title: "Stok Bakiye Raporu",
    pagePath: "/stock/stock-balance",
    aliases: ["stok bakiye", "bakiye", "stok durumu"],
    criteriaSchema: (stockBalanceSchema as unknown as JsonSchemaObject) as YulaReportMeta["criteriaSchema"],
    fullSchema: stockBalanceSchema as unknown as JsonSchemaObject,
  },
];

// Geriye dönük takma ad (alias)
export const DEMO_REPORTS = REGISTERED_REPORTS;

export function findReport(scope: string): YulaReportMeta | undefined {
  return REGISTERED_REPORTS.find((r) => r.scope === scope);
}
