"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, FileSpreadsheet, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";

/** Yatay bar kartındaki "En Yüksek 5" tablosu gibi dış kullanımlar için file çipi */
export function FileOpenChip({ path, label }: { path: string; label: string }) {
  const t = useTranslations("ChatMarkdown");
  const [failed, setFailed] = React.useState(false);

  const open = async () => {
    try {
      window.open(`/api/yula-exports/${encodeURIComponent(path)}`, "_blank");
      setFailed(false);
    } catch (err) {
      console.warn("[FileChip] Could not open the file:", err);
      setFailed(true);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      title={failed ? t("file_failed", { path }) : path}
      className={cn(
        "mx-0.5 inline-flex max-w-64 items-center gap-1 rounded-md border bg-card px-1.5 py-0.5 align-middle text-[11px] font-medium shadow-xs transition-colors",
        failed
          ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
          : "cursor-pointer text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
      )}
    >
      <FileSpreadsheet className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function CriteriaApplyChip({
  scope,
  criteria,
  children,
}: {
  scope: string;
  criteria: Record<string, unknown>;
  children?: React.ReactNode;
}) {
  const [applied, setApplied] = React.useState(false);
  const t = useTranslations("ChatMarkdown");

  const handleApply = async () => {
    try {
      const { applyCriteriaToDraft } = await import(
        "@/features/report-criteria/lib/apply-criteria-to-draft"
      );
      applyCriteriaToDraft(scope, criteria);
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    } catch (err) {
      console.warn("[CriteriaApplyChip] Criteria could not be applied:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleApply}
      title={t("apply_criteria_desc")}
      className={cn(
        "inline-flex items-center gap-1.5 my-1 mx-1 px-2.5 py-1 rounded-md text-[11.5px] font-medium border transition-all cursor-pointer select-none align-middle shadow-xs hover:scale-[1.02] active:scale-[0.98]",
        applied
          ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          : "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400 hover:bg-orange-500/20"
      )}
    >
      {applied ? (
        <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Sparkles className="size-3.5 shrink-0 text-orange-500" />
      )}
      <span className="font-semibold">{children}</span>
      <span className="text-[10px] opacity-85 underline ml-0.5 font-normal">
        {applied ? t("criteria_applied") : t("criteria_apply")}
      </span>
    </button>
  );
}
