"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation";
import { BarChart2, RotateCcw, AlertTriangle, Package, Database, FileText } from "lucide-react";
import { useYulaChat } from "@/hooks/use-yula-chat";
import { PromptChipsRow } from "./prompt-chips";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { extractJobIdFromHref, isReportResultPath } from "@/lib/workspace-paths";

export interface QuickChip {
  label: string;
  prompt: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/** Sonuç evresi şablonu — labelKey QuickChips ad alanına aittir. */
type ResultChipTemplate = {
  labelKey:
    | "top5_charts"
    | "anomaly_risk"
    | "sql_analysis"
    | "explain_columns"
    | "clear_filters";
  icon?: React.ComponentType<{ className?: string }>;
};

/** Sonuç evresi — slash komutlarıyla aynı iş (grid açıkken). Anomali = /analiz. */
const RESULT_CHIPS_TEMPLATE: ResultChipTemplate[] = [
  { labelKey: "top5_charts", icon: BarChart2 },
  { labelKey: "anomaly_risk", icon: AlertTriangle },
  { labelKey: "sql_analysis", icon: Database },
  { labelKey: "explain_columns", icon: FileText },
  { labelKey: "clear_filters", icon: RotateCcw },
];

export function YulaQuickActionChips() {
  const t = useTranslations("QuickChips")
  const { sendMessageText, busy } = useYulaChat();
  const pathname = usePathname();
  const selectedJobId =
    typeof window !== "undefined"
      ? extractJobIdFromHref(`${pathname}${window.location.search}`)
      : null;
  const isViewingResults = isReportResultPath(pathname) || Boolean(selectedJobId);

  const chips = React.useMemo<QuickChip[]>(() => {
    if (isViewingResults) {
      return RESULT_CHIPS_TEMPLATE.map((c) => ({
        ...c,
        label: t(c.labelKey),
        prompt: c.labelKey === "anomaly_risk" ? "/analiz" : t(`${c.labelKey}_prompt`),
      }))
    }
    const path = (pathname ?? "/").split("?")[0] || "/"
    return REGISTERED_REPORTS.filter(
      (r) => path !== r.pagePath && !path.startsWith(`${r.pagePath}/`),
    ).map<QuickChip>((r) => ({
      label: r.title,
      prompt: t("prepare_prompt", { title: r.title }),
      icon: Package,
    }))
  }, [isViewingResults, pathname, t])

  if (chips.length === 0) return null;

  return (
    <PromptChipsRow
      items={chips}
      onPick={(chip) => !busy && sendMessageText((chip as QuickChip).prompt)}
      className="py-1 px-0.5"
    />
  );
}
