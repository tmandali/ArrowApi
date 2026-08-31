"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { BarChart2, RotateCcw, AlertTriangle, Package, Database, FileText } from "lucide-react";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { PromptChipsRow } from "./prompt-chips";
import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";
import { useYulaGridStore } from "@/lib/stores/grid";
import { isReportResultView } from "@/lib/workspace-paths";

export interface QuickChip {
  label: string;
  prompt: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Sonuç evresi çipleri — grid AÇIKKEN / GUID sonuç sayfasında: analize odaklı */
const RESULT_CHIPS: QuickChip[] = [
  { label: "En Yüksek 5 Grafik", prompt: "En yüksek ilk 5 kaydı grafikle özetle", icon: BarChart2 },
  { label: "Anomali & Risk", prompt: "Bu raporda anomali ve risk taşıyan kritik kayıtlar var mı?", icon: AlertTriangle },
  { label: "SQL Analizi & Öneri", prompt: "Tabloyu SQL uzmanı gibi analiz et: profili çıkar, önerilerini ve doğrulama sorgularını paylaş", icon: Database },
  { label: "Kolonları Açıkla", prompt: "Bu raporun kolonlarını açıkla", icon: FileText },
  { label: "Filtreleri Temizle", prompt: "Aktif filtreleri temizle ve tabloyu sıfırla", icon: RotateCcw },
];

/** Workspace evresi çipleri — grid YOKKEN: rapor başlatma */
const WORKSPACE_CHIPS: QuickChip[] = [
  { label: "Anomali & Risk (Rapor)", prompt: "Stok bakiye raporunda anomali ve risk taşıyan kritik kayıtlar var mı? Önce raporu çalıştır.", icon: AlertTriangle },
];

export function YulaQuickActionChips() {
  const { sendMessageText, busy } = useYulaChat();
  const pathname = usePathname();
  const spec = useYulaGridStore((s) => s.spec);
  
  // Evre tespiti: GUID URL veya DuckDB Grid AÇIK → sonuç evresi (analiz çipleri); YOK → workspace evresi
  const isViewingResults = isReportResultView(pathname, spec);

  const chips = React.useMemo<QuickChip[]>(() => {
    if (isViewingResults) return RESULT_CHIPS;
    return [
      ...DEMO_REPORTS.map<QuickChip>((r) => ({
        label: r.title,
        prompt: `${r.title} hazırla`,
        icon: Package,
      })),
      ...WORKSPACE_CHIPS,
    ];
  }, [isViewingResults]);

  return (
    <PromptChipsRow
      items={chips}
      onPick={(chip) => !busy && sendMessageText((chip as QuickChip).prompt)}
      className="py-1 px-0.5"
    />
  );
}
