"use client";

import { useTranslations } from "next-intl";
import {
  AlertCircle,
  AlertTriangle,
  Database,
  FileSpreadsheet,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCount } from "@/utils/format";
import type { ExportWarning } from "./use-grid-export";

/** Excel satır-sınır uyarı diyaloğu (uyarı / sert limit). */
export function ExportWarningDialog({
  warning,
  onDismiss,
  onExport,
}: {
  warning: ExportWarning;
  onDismiss: () => void;
  onExport: (format: "xlsx" | "parquet", maxTotalRows?: number) => void;
}) {
  const t = useTranslations("ReportGrid");

  return (
    <Dialog
      open={warning !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {warning?.type === "hard_limit" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="size-5 shrink-0" />
                <DialogTitle className="text-base font-semibold">
                  {t("excel_limit_title")}
                </DialogTitle>
              </div>
              <DialogDescription className="pt-2 text-xs leading-relaxed text-muted-foreground">
                {t("excel_limit_desc", { count: formatCount(warning.count) })}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-semibold">{t("excel_limit_solution_label")}</p>
              <p className="mt-0.5 text-muted-foreground">
                {t("excel_limit_solution_text")}
              </p>
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDismiss}
              >
                <Filter className="mr-1.5 size-3.5" />
                {t("btn_edit_filters")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onExport("xlsx", 1_000_000)}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600 dark:text-emerald-400" />
                {t("btn_first_million")}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onExport("parquet")}
              >
                <Database className="mr-1.5 size-3.5 text-purple-400" />
                {t("btn_download_all_parquet", { count: formatCount(warning.count) })}
              </Button>
            </DialogFooter>
          </>
        ) : warning?.type === "warning" ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                <AlertTriangle className="size-5 shrink-0" />
                <DialogTitle className="text-base font-semibold">
                  {t("big_dataset_title")}
                </DialogTitle>
              </div>
              <DialogDescription className="pt-2 text-xs leading-relaxed text-muted-foreground">
                {t("big_dataset_desc", { count: formatCount(warning.count) })}
              </DialogDescription>
            </DialogHeader>

            <p className="text-xs text-muted-foreground">
              {t("big_dataset_note")}
            </p>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onDismiss}
              >
                {t("btn_cancel_filter")}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onExport("xlsx", 1_000_000)}
              >
                <FileSpreadsheet className="mr-1.5 size-3.5 text-emerald-600 dark:text-emerald-400" />
                {t("btn_first_million")}
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => onExport("xlsx")}
              >
                {t("btn_download_2_sheets")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
