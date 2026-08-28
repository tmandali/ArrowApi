"use client";

import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TableProperties } from "lucide-react";
import { cn } from "@/utils/cn";

const numberFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 });

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return numberFmt.format(value);
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  const s = String(value);
  return s.length > 120 ? `${s.slice(0, 117)}…` : s;
}

/**
 * run_expert_sql gibi araçların döndürdüğü satırları deterministik tablo
 * olarak basar. Amaç: modelin satırları kendi metnine yeniden yazmasını
 * gereksizleştirmek — kullanıcı her zaman DuckDB'nin döndürdüğü gerçek
 * satırları görür (tekrar/transkripsiyon hatası imkânsızlaşır).
 */
export function ToolResultTable({
  output,
  className,
}: {
  output: unknown;
  className?: string;
}) {
  const outputKey = React.useMemo(() => {
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }, [output]);

  const parsed = React.useMemo(() => {
    const o =
      typeof output === "object" && output !== null
        ? (output as Record<string, unknown>)
        : null;
    if (
      !o ||
      o.status !== "ok" ||
      !Array.isArray(o.rows) ||
      o.rows.length === 0
    ) {
      return null;
    }
    const rows = (o.rows as unknown[]).filter(
      (r): r is Record<string, unknown> => typeof r === "object" && r !== null,
    );
    if (rows.length === 0) return null;
    const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    return {
      rows,
      columns,
      rowCount: typeof o.rowCount === "number" ? o.rowCount : rows.length,
      querySql: typeof o.sql === "string" ? o.sql : typeof o.querySql === "string" ? o.querySql : null,
    };
  }, [outputKey]);

  if (!parsed) return null;

  const handleLoadInGrid = async () => {
    if (!parsed.querySql) return;
    try {
      const { useYulaGridStore } = await import("@/lib/stores/grid");
      useYulaGridStore.getState().setCustomQuerySql(parsed.querySql, "Yula AI Özel Sorgu");
    } catch (err) {
      console.warn("[ToolResultTable] Could not set grid query:", err);
    }
  };

  // Tek satırlık sonuç (örn. "boş batch sayısı, min, max, ort" gibi skaler
  // küme) → yatay tablo yerine dikey Etiket→Değer kartı; okunur ve kompakt.
  if (parsed.rows.length === 1) {
    const row = parsed.rows[0];
    return (
      <div
        className={cn("w-full overflow-hidden rounded-md border", className)}
      >
        <div className="divide-y divide-border/60">
          {parsed.columns.map((c) => (
            <div
              key={c}
              className="flex min-h-7 items-center justify-between gap-3 px-3 py-1"
            >
              <span className="truncate text-[11px] leading-none text-muted-foreground">
                {c}
              </span>
              <span
                className={cn(
                  "text-xs font-medium leading-none",
                  typeof row[c] === "number" && "tabular-nums",
                )}
              >
                {formatCell(row[c])}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("w-full overflow-hidden rounded-md border", className)}
    >
      {/* Grid ile aynı ölçü dili: 28px satır, 11px font, border-border/60 */}
      <div className="max-h-[280px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
            <TableRow>
              {parsed.columns.map((c) => (
                <TableHead
                  key={c}
                  className="h-7 whitespace-nowrap px-2 py-0 text-[11px] font-medium leading-none text-muted-foreground"
                >
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {parsed.rows.map((row, i) => (
              <TableRow key={i} className="h-7">
                {parsed.columns.map((c) => (
                  <TableCell
                    key={c}
                    className={cn(
                      "max-w-64 truncate whitespace-nowrap px-2 py-0 text-[11px] leading-none",
                      typeof row[c] === "number" &&
                        "text-right tabular-nums",
                    )}
                  >
                    {formatCell(row[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex h-8 items-center justify-between border-t bg-muted/40 px-2.5">
        <span className="text-[11px] font-medium leading-none text-muted-foreground">
          {parsed.rowCount} kayıt listelendi
        </span>
        {parsed.querySql && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300"
            onClick={handleLoadInGrid}
          >
            <TableProperties className="size-3.5" />
            Ana Tabloda Göster
          </Button>
        )}
      </div>
    </div>
  );
}
