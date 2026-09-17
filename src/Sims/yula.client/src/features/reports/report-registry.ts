import type { JsonSchemaObject } from "@/features/report-criteria";
// Şema JSON dosyaları doğrudan (derin) içe aktarılır; workspace index'inden
// import tsx/Node test ortamında döngüsel bir re-export zinciri üretir
// (index → form bileşenleri → report-criteria → bu modül). Bundler'da
// davranış aynıdır: tek kaynak yine schemas/*.json dosyalarıdır.
import stockBalanceCriteriaSchema from "@/workspaces/stock/stock-balance/schemas/stock-balance-criteria.schema.json";
import stockAnalyticsCriteriaSchema from "@/workspaces/stock/stock-analytics/schemas/stock-analytics-criteria.schema.json";
import retailSalesCriteriaSchema from "@/workspaces/stock/retail-sales-report/schemas/retail-sales-criteria.schema.json";

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
    criteriaSchema: stockBalanceCriteriaSchema as unknown as YulaReportMeta["criteriaSchema"],
    fullSchema: stockBalanceCriteriaSchema as unknown as JsonSchemaObject,
  },
  {
    scope: "stock-analytics",
    workspace: "stock",
    title: "Stok Analiz Raporu",
    pagePath: "/stock/stock-analytics",
    aliases: ["stok analiz", "analiz", "stok istatistik", "stok hareket analiz", "stock analytics"],
    criteriaSchema: stockAnalyticsCriteriaSchema as unknown as YulaReportMeta["criteriaSchema"],
    fullSchema: stockAnalyticsCriteriaSchema as unknown as JsonSchemaObject,
  },
  {
    scope: "retail-sales-report",
    workspace: "stock",
    title: "Perakende Satış Raporu",
    pagePath: "/stock/retail-sales-report",
    aliases: ["perakende satış", "retail sales", "satış raporu", "mağaza satış"],
    criteriaSchema: retailSalesCriteriaSchema as unknown as YulaReportMeta["criteriaSchema"],
    fullSchema: retailSalesCriteriaSchema as unknown as JsonSchemaObject,
  },
];

export function findReport(scope: string): YulaReportMeta | undefined {
  return REGISTERED_REPORTS.find((r) => r.scope === scope);
}
