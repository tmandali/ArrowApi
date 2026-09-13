"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Database,
  Download,
  EyeOff,
  FileArchive,
  FileSpreadsheet,
  RotateCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/utils/cn";
import type { ExportFormat } from "./use-grid-export";

/** Grid başlık aksiyonları: gizli-kolon rozeti + yenile + dışa aktarma menüsü. */
export function ReportGridHeaderActions({
  headerActions,
  hiddenCount,
  onClearHidden,
  onRefresh,
  refreshDisabled,
  refreshSpinning,
  exportDisabled,
  isExporting,
  onExport,
}: {
  headerActions?: React.ReactNode;
  hiddenCount: number;
  onClearHidden: () => void;
  onRefresh: () => void;
  refreshDisabled: boolean;
  refreshSpinning: boolean;
  exportDisabled: boolean;
  isExporting: boolean;
  onExport: (format: ExportFormat) => void;
}) {
  const t = useTranslations("ReportGrid");

  return (
    <>
      {headerActions}
      {hiddenCount > 0 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onClearHidden}
          title={t("hidden_columns_tooltip", { count: hiddenCount })}
        >
          <EyeOff className="size-3.5 shrink-0" />
          <span>{hiddenCount} {t("hidden_count_badge")}</span>
          <X className="size-3 shrink-0" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-7 shrink-0"
        onClick={onRefresh}
        disabled={refreshDisabled}
        title={t("refresh_title")}
        aria-label="Refresh report"
      >
        <RotateCw className={cn("size-3.5", refreshSpinning && "animate-spin")} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            disabled={exportDisabled}
            title="Export (Excel, Parquet, CSV)"
            aria-label="Export"
          >
            {isExporting ? (
              <Spinner className="size-3.5" />
            ) : (
              <Download className="size-3.5 text-muted-foreground" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => onExport("xlsx")}
            className="cursor-pointer gap-2 py-2"
          >
            <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">Excel (.xlsx)</span>
              <span className="text-[10px] text-muted-foreground">{t("export_xlsx_subtitle")}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => onExport("parquet")}
            className="cursor-pointer gap-2 py-2"
          >
            <Database className="size-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">Apache Parquet (.parquet)</span>
              <span className="text-[10px] text-muted-foreground">{t("export_parquet_subtitle")}</span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onExport("gz")}
            className="cursor-pointer gap-2 py-2"
          >
            <FileArchive className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-xs">CSV (.csv.gz)</span>
              <span className="text-[10px] text-muted-foreground">{t("export_gz_subtitle")}</span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
