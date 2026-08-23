import * as React from "react"
import { Sparkles, BarChart2, Filter, RotateCcw, Play, Package, TrendingUp, AlertTriangle } from "lucide-react"
import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace"
import { autoReportCardConfigs } from "@/lib/auto-report-registry"
import { readReportAiMetadata } from "@/lib/report-ai-metadata"

export interface QuickChip {
  label: string
  prompt: string
  icon?: React.ComponentType<{ className?: string }>
}

function getPromptIcon(text: string) {
  const t = text.toLowerCase()
  if (t.includes("anomali") || t.includes("risk") || t.includes("🚨") || t.includes("⚠️") || t.includes("eksi")) return AlertTriangle
  if (t.includes("temizle") || t.includes("sıfırla") || t.includes("kaldır")) return RotateCcw
  if (t.includes("süz") || t.includes("filtre") || t.includes("olan")) return Filter
  if (t.includes("toplam") || t.includes("kpi") || t.includes("metrik") || t.includes("özet")) return TrendingUp
  if (t.includes("grafik") || t.includes("en yüksek") || t.includes("analiz")) return BarChart2
  return Sparkles
}

export function YulaQuickActionChips() {
  const screenContext = useAgentBridgeStore((s) => s.screenContext)
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt)
  const isProcessing = useAgentBridgeStore((s) => s.isProcessing)
  const activeWorkspaceId = useActiveWorkspaceId()

  const chips = React.useMemo<QuickChip[]>(() => {
    const isResults = Boolean(screenContext?.activeDataSummary?.isViewingResults)

    // 1. Sonuç Tablosu Açıkken: Rapor Şemasındaki x-ai-results-prompts veya Dinamik Şema Keşfi
    if (isResults) {
      // 1.1 Context üzerinden doğrudan gelen resultsPrompts
      if (screenContext?.resultsPrompts && screenContext.resultsPrompts.length > 0) {
        return screenContext.resultsPrompts.map((prompt) => ({
          label: prompt,
          prompt,
          icon: getPromptIcon(prompt),
        }))
      }

      // 1.2 Aktif rapora ait JSON Schema'dan x-ai-results-prompts oku
      const matchedConfig = autoReportCardConfigs.find((c) =>
        (screenContext?.screenTitle && c.title && screenContext.screenTitle.toLowerCase().includes(c.title.toLowerCase())) ||
        (screenContext?.screenId && c.scope && screenContext.screenId.toLowerCase().includes(c.scope.toLowerCase()))
      )
      const schemaResultsPrompts = matchedConfig
        ? readReportAiMetadata(matchedConfig.schema).resultsPrompts
        : undefined

      if (schemaResultsPrompts && schemaResultsPrompts.length > 0) {
        return schemaResultsPrompts.map((prompt) => ({
          label: prompt,
          prompt,
          icon: getPromptIcon(prompt),
        }))
      }

      // 1.3 Şema Tanımı Olmayan Yeni Raporlar İçin Dinamik Kolon Keşfi Fallback
      const cols: string[] = screenContext?.activeDataSummary?.columns || []
      const hasStockOrBalance = cols.some((c) => /^(balance|stock|quantity|miktar|bakiye|stok)/i.test(c))
      const hasAmountOrCost = cols.some((c) => /^(amount|cost|tutar|maliyet|debit|credit)/i.test(c))

      return [
        {
          label: "🚨 Anomali & Risk",
          prompt: "Bu raporda anomali ve eksiye düşen kritik kayıtlar var mı?",
          icon: AlertTriangle,
        },
        {
          label: hasStockOrBalance ? "En Yüksek Bakiyeli 5" : hasAmountOrCost ? "En Yüksek Tutarlı 5" : "En Yüksek 5 Kayıt",
          prompt: "En yüksek ilk 5 kaydı grafikle özetle",
          icon: BarChart2,
        },
        {
          label: "Genel Toplam & KPI",
          prompt: "Bu tablodaki genel toplamı ve metrikleri özetle",
          icon: TrendingUp,
        },
        {
          label: "Filtreleri Temizle",
          prompt: "Filtreleri temizle",
          icon: RotateCcw,
        },
      ]
    }

    // 2. Belirli bir Rapor Kriter Ekranındayken: Şemadaki x-ai-quick-prompts önerileri
    if (screenContext?.quickPrompts && screenContext.quickPrompts.length > 0) {
      return [
        ...screenContext.quickPrompts.map((prompt) => ({
          label: prompt,
          prompt,
          icon: Sparkles,
        })),
        {
          label: "Raporu Çalıştır",
          prompt: "Raporu çalıştır",
          icon: Play,
        },
      ]
    }

    // 3. Genel Workspace Modu: Yalnızca mevcut aktif workspace'e ait otomatik kayıtlı raporlar
    const currentWorkspaceReports = autoReportCardConfigs.filter(
      (c) => c.workspace === activeWorkspaceId
    )

    if (currentWorkspaceReports.length > 0) {
      return currentWorkspaceReports.map((r) => ({
        label: r.title.replace(/\s*\([^)]*\)/, "").trim(),
        prompt: `${r.title} hazırla`,
        icon: Package,
      }))
    }

    // 4. Genel Sistem Raporları Fallback
    if (autoReportCardConfigs.length > 0) {
      return autoReportCardConfigs.slice(0, 3).map((r) => ({
        label: r.title.replace(/\s*\([^)]*\)/, "").trim(),
        prompt: `${r.title} hazırla`,
        icon: Package,
      }))
    }

    return []
  }, [screenContext, activeWorkspaceId])

  if (chips.length === 0) return null

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 scrollbar-none">
      {chips.map((chip, i) => {
        const Icon = chip.icon || Sparkles
        return (
          <button
            key={i}
            type="button"
            disabled={isProcessing}
            onClick={() => void sendPrompt(chip.prompt)}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/80 bg-background/90 px-2.5 py-1 text-[11px] font-medium text-foreground shadow-2xs transition-all hover:border-orange-500/40 hover:bg-orange-500/8 hover:text-orange-600 dark:hover:text-orange-400 active:scale-95 disabled:opacity-50 cursor-pointer group"
          >
            <Icon className="size-3 text-orange-500/80 dark:text-orange-400/80 group-hover:text-orange-600 dark:group-hover:text-orange-300 shrink-0 transition-colors" />
            <span className="truncate">{chip.label}</span>
          </button>
        )
      })}
    </div>
  )
}
