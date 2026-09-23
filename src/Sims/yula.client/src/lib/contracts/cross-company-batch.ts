/**
 * Cross-Company Segregated Batch Execution Engine
 * 
 * Implements the tenant-isolation principle for holding/multi-company operations:
 * When an executive issues a cross-company command (e.g. "Approve all pending orders"),
 * actions are executed isolated within each company's legal context and jurisdiction strategy,
 * producing segregated, auditable results per company.
 */

export interface CompanyBatchItem<TPayload = unknown> {
  id: string;
  companyId: string;
  companyName: string;
  countryCode: "TR" | "DE" | "US" | string;
  payload: TPayload;
}

export interface CompanyBatchItemResult<TResult = unknown> {
  id: string;
  success: boolean;
  result?: TResult;
  error?: string;
}

export interface CompanyBatchGroupResult<TResult = unknown> {
  companyId: string;
  companyName: string;
  countryCode: string;
  totalCount: number;
  succeededCount: number;
  failedCount: number;
  items: CompanyBatchItemResult<TResult>[];
}

export interface SegregatedBatchSummary<TResult = unknown> {
  totalCompanies: number;
  totalItems: number;
  totalSucceeded: number;
  totalFailed: number;
  byCompany: Record<string, CompanyBatchGroupResult<TResult>>;
}

/**
 * Executes a batch of actions segregated by company and country jurisdiction.
 * Ensures an error in one company (e.g. German VAT VIES failure) safely halts
 * only that item without failing actions in other companies.
 */
export async function executeSegregatedBatch<TPayload = unknown, TResult = unknown>(
  items: CompanyBatchItem<TPayload>[],
  executor: (item: CompanyBatchItem<TPayload>) => Promise<TResult>,
): Promise<SegregatedBatchSummary<TResult>> {
  const byCompany: Record<string, CompanyBatchGroupResult<TResult>> = {};

  for (const item of items) {
    if (!byCompany[item.companyId]) {
      byCompany[item.companyId] = {
        companyId: item.companyId,
        companyName: item.companyName,
        countryCode: item.countryCode,
        totalCount: 0,
        succeededCount: 0,
        failedCount: 0,
        items: [],
      };
    }

    const group = byCompany[item.companyId];
    group.totalCount++;

    try {
      const result = await executor(item);
      group.succeededCount++;
      group.items.push({
        id: item.id,
        success: true,
        result,
      });
    } catch (err: unknown) {
      group.failedCount++;
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      group.items.push({
        id: item.id,
        success: false,
        error: errorMessage,
      });
    }
  }

  const groups = Object.values(byCompany);
  return {
    totalCompanies: groups.length,
    totalItems: items.length,
    totalSucceeded: groups.reduce((acc, g) => acc + g.succeededCount, 0),
    totalFailed: groups.reduce((acc, g) => acc + g.failedCount, 0),
    byCompany,
  };
}

/**
 * Formats a segregated batch summary into human-readable markdown for the chat UI.
 */
export function formatSegregatedBatchReport(
  summary: SegregatedBatchSummary<any>,
): string {
  const lines: string[] = [];
  lines.push(`### 🏢 Toplu İşlem Raporu (${summary.totalCompanies} Şirket, ${summary.totalItems} İşlem)`);
  lines.push(`**Genel Durum:** ✅ ${summary.totalSucceeded} Başarılı, ⚠️ ${summary.totalFailed} Başarısız/Beklemede\n`);

  for (const group of Object.values(summary.byCompany)) {
    const flag =
      group.countryCode === "TR"
        ? "🇹🇷"
        : group.countryCode === "DE"
          ? "🇩🇪"
          : group.countryCode === "US"
            ? "🇺🇸"
            : "🌐";

    lines.push(`#### ${flag} ${group.companyName} (${group.succeededCount}/${group.totalCount} Onaylandı)`);
    for (const item of group.items) {
      if (item.success) {
        lines.push(`- ✅ \`#${item.id}\`: Başarıyla onaylandı.`);
      } else {
        lines.push(`- ⚠️ \`#${item.id}\`: **Bekletildi / Hata:** ${item.error}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
