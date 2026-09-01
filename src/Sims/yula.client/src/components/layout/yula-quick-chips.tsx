"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { BarChart2, RotateCcw, AlertTriangle, Package, Database, FileText } from "lucide-react";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { PromptChipsRow } from "./prompt-chips";
import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";
import { extractJobIdFromHref, isReportResultPath } from "@/lib/workspace-paths";

export interface QuickChip {
  label: string;
  prompt: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Sonuç evresi — slash komutlarıyla aynı iş (grid açıkken). Anomali = /analiz. */
const RESULT_CHIPS: QuickChip[] = [
  { label: "En Yüksek 5 Grafik", prompt: "En yüksek ilk 5 kaydı grafikle özetle", icon: BarChart2 },
  { label: "Anomali & Risk", prompt: "/analiz", icon: AlertTriangle },
  { label: "SQL Analizi & Öneri", prompt: "Tabloyu SQL uzmanı gibi analiz et: profili çıkar, önerilerini ve doğrulama sorgularını paylaş", icon: Database },
  { label: "Kolonları Açıkla", prompt: "Bu raporun kolonlarını açıkla", icon: FileText },
  { label: "Filtreleri Temizle", prompt: "Aktif filtreleri temizle ve tabloyu sıfırla", icon: RotateCcw },
];

export function YulaQuickActionChips() {
  const { sendMessageText, busy } = useYulaChat();
  const pathname = usePathname();
  const selectedJobId =
    typeof window !== "undefined"
      ? extractJobIdFromHref(`${pathname}${window.location.search}`)
      : null;
  const isViewingResults = isReportResultPath(pathname) || Boolean(selectedJobId);

  const chips = React.useMemo<QuickChip[]>(() => {
    if (isViewingResults) return RESULT_CHIPS;
    const path = (pathname ?? "/").split("?")[0] || "/";
    return DEMO_REPORTS.filter(
      (r) => path !== r.pagePath && !path.startsWith(`${r.pagePath}/`),
    ).map<QuickChip>((r) => ({
      label: r.title,
      prompt: `${r.title} hazırla`,
      icon: Package,
    }));
  }, [isViewingResults, pathname]);

  if (chips.length === 0) return null;

  return (
    <PromptChipsRow
      items={chips}
      onPick={(chip) => !busy && sendMessageText((chip as QuickChip).prompt)}
      className="py-1 px-0.5"
    />
  );
}
