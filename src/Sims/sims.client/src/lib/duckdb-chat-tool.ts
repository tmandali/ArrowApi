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
        return {
          status: "success",
          rowCount: rows.length,
          rows: rows.slice(0, 50), // Cap for chat performance
          description: args.description,
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
