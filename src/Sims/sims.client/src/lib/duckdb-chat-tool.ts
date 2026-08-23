import { toolRegistry, type ToolDefinition } from "./tool-registry";
import { duckDbClient } from "@/services/duckdb";

/**
 * AI Tool that allows Yula to execute SQL queries on the active in-browser DuckDB report tables.
 */
export function registerDuckDbChatTool(): () => void {
  const toolDef: ToolDefinition = {
    name: "query_report_data",
    description: "Tarayıcı içindeki DuckDB WASM üzerinde yerel SQL sorgusu çalıştırır. Rapor verilerinden özet çıkarmak, en yüksek/en düşük değerleri bulmak, toplam/ortalama hesaplamak için kullanılır. Örnek: SELECT * FROM stock_balance ORDER BY tutar DESC LIMIT 5;",
    parameters: {
      type: "object",
      properties: {
        sql: {
          type: "string",
          description: "Çalıştırılacak DuckDB SQL sorgusu. (Örn: 'SELECT urunAdi, SUM(miktar) FROM current_report GROUP BY urunAdi ORDER BY 2 DESC LIMIT 5')",
        },
        description: {
          type: "string",
          description: "Kullanıcıya gösterilecek kısa açıklama (örn: 'En yüksek 5 stok kalemi listelendi')",
        },
      },
      required: ["sql"],
    },
    execute: async (args: Record<string, any>) => {
      try {
        const sql = String(args.sql || "");
        if (!sql) {
          return { status: "error", error: "SQL sorgusu belirtilmedi." };
        }
        console.log("[DuckDbChatTool] Executing SQL:", sql);
        const rows = await duckDbClient.executeCustomSql(sql);

        if (rows && rows.length > 0) {
          const firstRow = rows[0];
          const keys = Object.keys(firstRow);
          const numKey = keys.find((k) => typeof firstRow[k] === "number") || keys[1];
          const lblKey = keys.find((k) => typeof firstRow[k] === "string" && k.toLowerCase() !== "id") || keys[0];

          const chartData = rows.slice(0, 5).map((r) => ({
            name: String(r[lblKey] || "Kayıt"),
            value: typeof r[numKey] === "number" ? (r[numKey] as number) : parseFloat(String(r[numKey]).replace(/[^0-9.-]/g, "")) || 0,
          }));

          return {
            success: true,
            customKind: "yula_chart_card",
            title: args.description || "Rapor Veri Analizi",
            summary: `${rows.length} satır bulundu`,
            chartType: "bar",
            chartData,
            kpis: [
              { label: "Sonuç Sayısı", value: rows.length },
              { label: "En Yüksek", value: chartData[0]?.value?.toLocaleString() ?? 0, sublabel: chartData[0]?.name },
            ],
            message: `📊 **SQL Analiz Sonucu:** ${rows.length} satır analiz edildi.`,
            rowCount: rows.length,
            rows: rows.slice(0, 50),
          };
        }

        return {
          status: "success",
          rowCount: 0,
          rows: [],
          description: args.description,
          message: "Sorgu çalıştırıldı ancak eşleşen sonuç dönmedi.",
        };
      } catch (err: any) {
        console.error("[DuckDbChatTool] SQL Error:", err);
        return {
          status: "error",
          error: err?.message || String(err),
        };
      }
    },
  };

  return toolRegistry.register(toolDef);
}
