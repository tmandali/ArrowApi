import * as React from "react"
import { FileSpreadsheet, FileText, Copy, Check, AlertTriangle } from "lucide-react"

import { isTauriEnv } from "@/lib/api-url"
import { cn } from "@/utils/cn"

/**
 * report_export_xlsx çıktısı için sade dosya kartı.
 *
 * Konvansiyon: <skill-adı>.card.tsx dosyası src/skills/<klasörü>/ altında yaşar;
 * Vite build sırasında import.meta.glob ile taranır ve customKind = skill adı
 * üzerinden otomatik render edilir. Çalışma anında derleme YOKTUR.
 */

export interface SkillCardProps {
  data?: {
    title?: string
    file_path: string
    file_name: string
    rows_written?: number
    format?: string
    warning?: string
  }
}

export default function ReportExportXlsxCard({ data }: SkillCardProps) {
  const d = data
  const [copied, setCopied] = React.useState(false)

  if (!d?.file_path) return null

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(d.file_path)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const openFile = async () => {
    if (isTauriEnv) {
      try {
        const { open } = await import("@tauri-apps/plugin-shell")
        await open(d.file_path)
        return
      } catch {}
    }
    // Web modunda dosya sistemi yok: yolu panoya al
    void copyPath()
  }

  return (
    <div className="inline-block max-w-full">
      <div className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-xs">
        {d.format === "csv" ? (
          <FileText className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <FileSpreadsheet className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        )}
        <button
          type="button"
          onClick={openFile}
          title={d.file_path}
          className="min-w-0 cursor-pointer truncate text-xs font-medium text-foreground underline-offset-2 hover:underline"
        >
          {d.file_name || d.title || "Dosya"}
        </button>
        {typeof d.rows_written === "number" ? (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {d.rows_written.toLocaleString("tr-TR")}
          </span>
        ) : null}
        <button
          type="button"
          onClick={copyPath}
          aria-label="Yolu kopyala"
          title={d.file_path}
          className={cn(
            "shrink-0 text-muted-foreground transition-opacity hover:text-foreground",
            copied ? "text-emerald-600 opacity-100 dark:text-emerald-400" : "opacity-0 group-hover:opacity-100"
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
      {d.warning ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="size-3 shrink-0" />
          <span>{d.warning}</span>
        </div>
      ) : null}
    </div>
  )
}
